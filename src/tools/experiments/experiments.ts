import { z } from "zod";
import {
  getDocsMetadata,
  handleResNotOk,
  type ExtendedToolsInterface,
  SUPPORTED_FILE_EXTENSIONS,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  featureFlagSchema,
  fetchFeatureFlag,
  mergeRuleIntoFeatureFlag,
  buildHeaders,
} from "../../utils.js";
import type {
  ListExperimentsResponse,
  GetExperimentResponse,
  PostExperimentResponse,
  ListAttributesResponse,
} from "../../api-type-helpers.js";
import {
  formatExperimentList,
  formatExperimentDetail,
  formatExperimentCreated,
  formatExperimentUpdated,
  formatExperimentStarted,
  formatExperimentStopped,
  formatExperimentResumed,
  formatExperimentArchived,
  formatExperimentTargetingUpdated,
  formatSnapshotResult,
  formatAttributes,
  formatApiError,
} from "../../format-responses.js";
import { getDefaults } from "../defaults.js";
import { type Experiment } from "../../types/types.js";
import { handleSummaryMode, getMetricLookup } from "./experiment-summary.js";

interface ExperimentTools extends ExtendedToolsInterface {}

function getPhaseToPostPhase(p: any): Record<string, any> {
  return {
    name: p.name,
    dateStarted: p.dateStarted,
    ...(p.dateEnded ? { dateEnded: p.dateEnded } : {}),
    ...(p.reasonForStopping ? { reason: p.reasonForStopping } : {}),
    ...(p.seed ? { seed: p.seed } : {}),
    coverage: p.coverage ?? 1,
    trafficSplit: p.trafficSplit ?? [],
    ...(p.namespace ? { namespace: p.namespace } : {}),
    targetingCondition: p.targetingCondition ?? "{}",
    prerequisites: p.prerequisites ?? [],
    savedGroupTargeting: p.savedGroupTargeting ?? [],
  };
}

const jsonStringSchema = (errorMsg: string) =>
  z.string().refine((s) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }, errorMsg);

export function registerExperimentTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: ExperimentTools) {
  /**
   * Tool: get_experiments
   */
  server.registerTool(
    "get_experiments",
    {
      title: "Get Experiments",
      description:
        "Lists experiments or fetches details for a specific experiment. Supports three modes: metadata (default) returns experiment config without results, good for listing; summary fetches results and returns key statistics including win rate and top performers, good for quick analysis; full returns complete results with all metrics (warning: large payloads). Use this to review recent experiments (mostRecent=true), analyze results, or check experiment status (draft, running, stopped). Single experiment fetch includes a link to view in GrowthBook.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("The ID of the project to filter experiments by")
          .optional(),
        mode: z
          .enum(["metadata", "summary", "full"])
          .default("metadata")
          .describe(
            "The mode to use to fetch experiments. Metadata mode returns experiment config without results. Summary mode fetches results and returns pruned key stats for quick analysis. Full mode fetches and returns complete results data. WARNING: Full mode may return large payloads.",
          ),
        experimentId: z
          .string()
          .describe("The ID of the experiment to fetch")
          .optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async (
      { limit, offset, mostRecent, project, mode, experimentId },
      extra,
    ) => {
      if (experimentId) {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/experiments/${experimentId}`,
            {
              headers: buildHeaders(apiKey),
            },
          );

          await handleResNotOk(res);
          const data = (await res.json()) as GetExperimentResponse;
          const dataWithResult = data as GetExperimentResponse & {
            result?: unknown;
          };

          if (mode === "full") {
            // Fetch results
            if (data.experiment.status === "draft") {
              dataWithResult.result = null;
            } else {
              try {
                const resultsRes = await fetchWithRateLimit(
                  `${baseApiUrl}/api/v1/experiments/${experimentId}/results`,
                  {
                    headers: buildHeaders(apiKey, false),
                  },
                );
                await handleResNotOk(resultsRes);
                const resultsData = await resultsRes.json();
                dataWithResult.result = resultsData.result;
              } catch (error) {
                console.error(
                  `Error fetching results for experiment ${experimentId}`,
                  error,
                );
              }
            }

            // Resolve metric IDs to names
            const metricIds = new Set<string>();
            for (const g of data.experiment.settings?.goals || [])
              metricIds.add(g.metricId);
            for (const g of data.experiment.settings?.guardrails || [])
              metricIds.add(g.metricId);
            for (const g of data.experiment.settings?.secondaryMetrics || [])
              metricIds.add(g.metricId);
            const metricLookup = await getMetricLookup(
              baseApiUrl,
              apiKey,
              metricIds,
            );

            // Multi-block response: curated summary first, raw results second
            const content: { type: "text"; text: string }[] = [
              {
                type: "text",
                text: formatExperimentDetail(
                  dataWithResult,
                  appOrigin,
                  metricLookup,
                ),
              },
            ];
            if (dataWithResult.result) {
              content.push({
                type: "text",
                text: `**Full results data (raw):**\n\`\`\`json\n${JSON.stringify(dataWithResult.result, null, 2)}\n\`\`\``,
              });
            }
            return { content };
          }

          return {
            content: [
              {
                type: "text",
                text: formatExperimentDetail(dataWithResult, appOrigin),
              },
            ],
          };
        } catch (error) {
          throw new Error(
            formatApiError(error, `fetching experiment '${experimentId}'`, [
              "Check the experiment ID is correct.",
              "Use get_experiments without an experimentId to list all available experiments.",
            ]),
          );
        }
      }

      const progressToken = extra._meta?.progressToken;

      const totalSteps = mode === "summary" ? 5 : mode === "full" ? 3 : 2;

      const reportProgress = async (
        progress: number,

        message?: string,
      ) => {
        if (progressToken) {
          await server.server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress,
              total: totalSteps,
              ...(message && { message }),
            },
          });
        }
      };

      await reportProgress(1, "Fetching experiments...");

      try {
        const data = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/experiments",
          limit,
          offset,
          mostRecent,
          project ? { projectId: project } : undefined,
        )) as ListExperimentsResponse;

        let experiments: Experiment[] =
          (data.experiments as Experiment[]) || [];

        if (mode === "full" || mode === "summary") {
          await reportProgress(2, "Fetching experiment results...");
          for (const [index, experiment] of experiments.entries()) {
            if (experiment.status === "draft") {
              experiments[index].result = undefined;
              continue;
            }
            try {
              const resultsRes = await fetchWithRateLimit(
                `${baseApiUrl}/api/v1/experiments/${experiment.id}/results`,
                {
                  headers: buildHeaders(apiKey, false),
                },
              );
              await handleResNotOk(resultsRes);
              const resultsData = await resultsRes.json();
              experiments[index].result = resultsData.result;
            } catch (error) {
              console.error(
                `Error fetching results for experiment ${experiment.id} (${experiment.name})`,
                error,
              );
            }
          }
        }

        if (mode === "summary") {
          const summaryExperiments = await handleSummaryMode(
            experiments,
            baseApiUrl,
            apiKey,
            reportProgress,
          );
          const summaryExperimentsWithPagination = {
            summary: summaryExperiments,
            limit: data.limit,
            offset: data.offset,
            total: data.total,
            hasMore: data.hasMore,
            nextOffset: data.nextOffset,
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summaryExperimentsWithPagination),
              },
            ],
          };
        }

        await reportProgress(2, "Processing results...");

        // Full mode: return raw JSON since users expect complete results data
        if (mode === "full") {
          return {
            content: [{ type: "text", text: JSON.stringify(data) }],
          };
        }

        return {
          content: [{ type: "text", text: formatExperimentList(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching experiments", [
            "Check that your GB_API_KEY has permission to read experiments.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: get_attributes
   */
  server.registerTool(
    "get_attributes",
    {
      title: "Get Attributes",
      description:
        "Lists all user attributes configured in GrowthBook. Attributes are user properties (like country, plan type, user ID) used for targeting in feature flags and experiments. Use this to see available attributes for targeting conditions in create_force_rule, understand targeting options when setting up experiments, or verify attribute names before writing conditions. Common examples: id, email, country, plan, deviceType, isEmployee. Attributes must be passed to the GrowthBook SDK at runtime for targeting to work.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.append("limit", "100");

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/attributes?${queryParams.toString()}`,
          {
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);

        const data = (await res.json()) as ListAttributesResponse;
        return {
          content: [{ type: "text", text: formatAttributes(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching attributes", [
            "Check that your GB_API_KEY has permission to read attributes.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: create_experiment
   */
  server.registerTool(
    "create_experiment",
    {
      title: "Create Experiment",
      description:
        "Creates a new A/B test experiment in GrowthBook. An experiment randomly assigns users to different variations and measures which performs better against your metrics. Prerequisites: 1) Call get_defaults first to review naming conventions and configuration, 2) If testing via a feature flag, provide its featureId OR create the flag first using create_feature_flag. Returns a draft experiment that the user must review and launch in the GrowthBook UI, including a link and SDK integration code. Do NOT use for simple feature toggles (use create_feature_flag) or targeting without measurement (use create_force_rule).",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Experiment name. Base name off the examples from get_defaults. If none are available, use a short, descriptive name that captures the essence of the experiment.",
          ),
        description: z.string().optional().describe("Experiment description."),
        hypothesis: z
          .string()
          .optional()
          .describe(
            "Experiment hypothesis. Base hypothesis off the examples from get_defaults. If none are available, use a falsifiable statement about what will happen if the experiment succeeds or fails.",
          ),
        valueType: z
          .enum(["string", "number", "boolean", "json"])
          .describe(
            "Value type for all variations (string|number|boolean|json). Must match the feature flag's valueType when featureId is provided.",
          ),
        variations: z
          .array(
            z.object({
              name: z
                .string()
                .describe(
                  "Variation name. Base name off the examples from get_defaults. If none are available, use a short, descriptive name that captures the essence of the variation.",
                ),
              value: z
                .union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.record(z.string(), z.any()),
                ])
                .describe(
                  "The value of this variation. Must match the specified valueType: provide actual booleans (true/false) not strings, actual numbers, strings, or valid JSON objects.",
                ),
            }),
          )
          .describe(
            'Array of experiment variations. Each has a name (displayed in GrowthBook UI) and value (what users receive). The first variation should be the control/default. Example: [{name: "Control", value: false}, {name: "Treatment", value: true}]',
          ),
        project: z
          .string()
          .describe("The ID of the project to create the experiment in")
          .optional(),
        featureId: featureFlagSchema.id
          .optional()
          .describe("The ID of the feature flag to create the experiment on."),
        fileExtension: z
          .enum(SUPPORTED_FILE_EXTENSIONS)
          .describe(
            "The extension of the current file. If it's unclear, ask the user.",
          ),
        confirmedDefaultsReviewed: z
          .boolean()
          .describe(
            "Set to true to confirm you have called get_defaults and reviewed the output to guide these parameters.",
          ),
        customFields: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Custom field values as key-value pairs. Keys are custom field IDs, values are string representations (e.g. {"priority": "high", "team": "growth"}).',
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      description,
      hypothesis,
      name,
      valueType,
      variations,
      fileExtension,
      confirmedDefaultsReviewed,
      project,
      featureId,
      customFields,
    }) => {
      if (!confirmedDefaultsReviewed) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Please call get_defaults and review the output to guide these parameters.",
            },
          ],
        };
      }

      // Fetch experiment defaults first and surface to user
      let experimentDefaults = await getDefaults(apiKey, baseApiUrl);

      const stringifyValue = (value: unknown): string =>
        typeof value === "object" ? JSON.stringify(value) : String(value);

      const experimentPayload = {
        name,
        description,
        hypothesis,
        owner: user,
        trackingKey: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        tags: ["mcp"],
        assignmentQueryId: experimentDefaults?.assignmentQuery,
        datasourceId: experimentDefaults?.datasource,
        variations: (variations as Array<{ name: string }>).map(
          (variation: { name: string }, idx: number) => ({
            key: idx.toString(),
            name: variation.name,
          }),
        ),
        ...(project && { project }),
        ...(customFields && { customFields }),
      };

      try {
        const experimentRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(experimentPayload),
          },
        );

        await handleResNotOk(experimentRes);

        const experimentData =
          (await experimentRes.json()) as PostExperimentResponse;

        let flagData = null;
        if (featureId) {
          // Fetch the existing feature flag first to preserve existing rules
          const existingFeature = await fetchFeatureFlag(
            baseApiUrl,
            apiKey,
            featureId,
          );

          // Create new experiment-ref rule
          const newRule = {
            type: "experiment-ref",
            experimentId: experimentData.experiment.id,
            variations: experimentData.experiment.variations.map(
              (expVariation: { variationId: string }, idx: number) => ({
                value: stringifyValue(variations[idx].value),
                variationId: expVariation.variationId,
              }),
            ),
          };

          // Merge new rule into existing feature flag
          const flagPayload = mergeRuleIntoFeatureFlag(
            existingFeature,
            newRule,
            experimentDefaults.environments,
          );

          const flagRes = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/features/${featureId}`,
            {
              method: "POST",
              headers: buildHeaders(apiKey),
              body: JSON.stringify(flagPayload),
            },
          );

          await handleResNotOk(flagRes);

          flagData = await flagRes.json();
        } // flagData is UpdateFeatureResponse when featureId was set

        const { stub, docs, language } = getDocsMetadata(fileExtension);

        return {
          content: [
            {
              type: "text",
              text: formatExperimentCreated(
                experimentData,
                appOrigin,
                featureId ? stub : undefined,
                language,
                docs,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `creating experiment '${name}'`, [
            "Call get_defaults first and use the returned datasource/assignment query IDs.",
            "If linking to a feature flag, verify the flag exists with get_feature_flags.",
            "Check that variation values match the specified valueType.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: update_experiment
   */
  server.registerTool(
    "update_experiment",
    {
      title: "Update Experiment",
      description:
        "Updates properties of an existing experiment. Only the provided fields are changed. For lifecycle changes, use start_experiment, stop_experiment, or archive_experiment instead. For targeting (conditions, traffic split, coverage, namespace, prerequisites) on running experiments, use update_experiment_targeting.",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        name: z.string().optional().describe("Updated name"),
        description: z.string().optional().describe("Updated description"),
        hypothesis: z.string().optional().describe("Updated hypothesis"),
        tags: z.array(z.string()).optional().describe("Replace tags"),
        trackingKey: z
          .string()
          .optional()
          .describe(
            "Unique tracking key for exposure logging. Must match the feature flag key when linked to a flag.",
          ),
        owner: z.string().optional().describe("Owner email"),
        project: z.string().optional().describe("Move to project"),
        metrics: z
          .array(z.string())
          .optional()
          .describe(
            "Goal metric IDs (use get_metrics or list_fact_metrics to find IDs)",
          ),
        guardrailMetrics: z
          .array(z.string())
          .optional()
          .describe(
            "Guardrail metric IDs (use get_metrics or list_fact_metrics to find IDs)",
          ),
        secondaryMetrics: z
          .array(z.string())
          .optional()
          .describe(
            "Secondary metric IDs (use get_metrics or list_fact_metrics to find IDs)",
          ),
        activationMetric: z
          .string()
          .optional()
          .describe(
            "Activation metric ID (use get_metrics or list_fact_metrics to find IDs)",
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ experimentId, ...fields }) => {
      try {
        const payload: Record<string, any> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) payload[key] = value;
        }

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatExperimentUpdated(data, appOrigin),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `updating experiment '${experimentId}'`, [
            "Check the experiment ID is correct.",
            "Use get_experiments to list available experiments.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: archive_experiment
   */
  server.registerTool(
    "archive_experiment",
    {
      title: "Archive Experiment",
      description:
        "Archives or unarchives an experiment (soft delete). Archived experiments are hidden from default views but can be restored.",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        archived: z
          .boolean()
          .default(true)
          .describe(
            "Set to true to archive, false to unarchive (default: true)",
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ experimentId, archived: archivedInput }) => {
      const archived = archivedInput ?? true;
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ archived }),
          },
        );
        await handleResNotOk(res);
        return {
          content: [
            {
              type: "text",
              text: formatExperimentArchived(experimentId, archived),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `${archived ? "archiving" : "unarchiving"} experiment '${experimentId}'`,
            ["Check the experiment ID is correct."],
          ),
        );
      }
    },
  );

  /**
   * Tool: start_experiment
   */
  server.registerTool(
    "start_experiment",
    {
      title: "Start Experiment",
      description:
        "Launches a draft experiment into 'running' status. The experiment must be in 'draft' status. Use get_experiments to check status first. Use update_experiment to configure metrics before launching. After launch, use update_experiment_targeting to change targeting without flipping status.",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        coverage: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(1.0)
          .describe("Traffic percentage 0-1 (default: 1.0)"),
        trafficSplit: z
          .array(
            z.object({
              variationId: z.string(),
              weight: z.number().min(0).max(1),
            }),
          )
          .optional()
          .describe(
            "Custom traffic split. Defaults to equal split across all variations.",
          ),
        targetingCondition: jsonStringSchema(
          'targetingCondition must be a valid JSON string (e.g., \'{"country":"US"}\')',
        )
          .optional()
          .describe(
            'MongoDB-style targeting condition for experiment entry, as a JSON string. Example: \'{"country": "US"}\'.',
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ experimentId, coverage, trafficSplit, targetingCondition }) => {
      try {
        const getRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          { headers: buildHeaders(apiKey) },
        );
        await handleResNotOk(getRes);
        const getData = await getRes.json();
        const experiment = getData.experiment;

        if (experiment.status !== "draft") {
          return {
            content: [
              {
                type: "text",
                text: `Cannot start experiment — current status is '${experiment.status}'. Only 'draft' experiments can be started. Use get_experiments to check experiment status.`,
              },
            ],
          };
        }

        const split =
          trafficSplit ||
          experiment.variations.map((v: any) => ({
            variationId: v.variationId,
            weight: 1 / experiment.variations.length,
          }));

        if (split.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Cannot start an experiment with no variations.",
              },
            ],
          };
        }

        const validVariationIds = new Set(
          experiment.variations.map((v: any) => v.variationId),
        );
        const uniqueSplitIds = new Set(split.map((v: any) => v.variationId));
        const totalWeight = split.reduce(
          (sum: number, v: any) => sum + v.weight,
          0,
        );

        if (
          split.length !== uniqueSplitIds.size ||
          uniqueSplitIds.size !== experiment.variations.length ||
          [...uniqueSplitIds].some((id) => !validVariationIds.has(id)) ||
          Math.abs(totalWeight - 1) > 1e-6
        ) {
          return {
            content: [
              {
                type: "text",
                text: "Invalid trafficSplit. Provide each variation exactly once (no duplicates) and ensure the weights sum to 1.",
              },
            ],
          };
        }

        const newPhase = {
          name: "Phase 1",
          dateStarted: new Date().toISOString(),
          coverage: coverage ?? 1.0,
          trafficSplit: split,
          targetingCondition: targetingCondition ?? "{}",
        };

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({
              status: "running",
              phases: [newPhase],
            }),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatExperimentStarted(data, appOrigin),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `starting experiment '${experimentId}'`, [
            "The experiment must be in 'draft' status.",
            "Use get_experiments to check the current status.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: update_experiment_targeting
   */
  server.registerTool(
    "update_experiment_targeting",
    {
      title: "Update Experiment Targeting",
      description:
        "Changes targeting on a running experiment without flipping its status. Use this when you need to swap targeting conditions, saved groups, prerequisites, namespace, traffic coverage, or variation weights mid-flight (e.g., change a UTM source filter on a Facebook experiment). Defaults to mode='newPhase' which appends a new phase — recommended for clean analysis since the previous data segment stays intact. Use mode='patchCurrent' only for typo fixes or pre-launch tweaks. Contrast with update_experiment (no targeting/phase fields) and start_experiment (only works on draft).",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        mode: z
          .enum(["newPhase", "patchCurrent"])
          .default("newPhase")
          .describe(
            "newPhase appends a new phase preserving the old data segment (recommended for mid-experiment targeting changes). patchCurrent mutates the current phase in place — use only for typo fixes or pre-launch tweaks.",
          ),
        targetingCondition: jsonStringSchema(
          'targetingCondition must be a valid JSON string (e.g., \'{"country":"US"}\')',
        )
          .optional()
          .describe("MongoDB-style targeting condition as a JSON string."),
        savedGroupTargeting: z
          .array(
            z.object({
              matchType: z.enum(["all", "any", "none"]),
              savedGroups: z.array(z.string()),
            }),
          )
          .optional()
          .describe("Saved group targeting rules."),
        prerequisites: z
          .array(
            z.object({
              id: z.string(),
              condition: jsonStringSchema(
                "prerequisites[].condition must be a valid JSON string",
              ).describe(
                "MongoDB-style condition as a JSON string evaluated against the prerequisite flag's value.",
              ),
            }),
          )
          .optional()
          .describe("Prerequisite feature flags with conditions."),
        namespace: z
          .object({
            namespaceId: z.string(),
            range: z
              .array(z.unknown())
              .describe(
                "Two-number tuple [start, end] with values 0-1 representing the namespace bucket range, e.g. [0, 0.5] for the first half.",
              ),
          })
          .nullable()
          .optional()
          .describe(
            "Namespace targeting. Pass null to clear an existing namespace.",
          ),
        coverage: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Traffic coverage 0-1."),
        trafficSplit: z
          .array(
            z.object({
              variationId: z.string(),
              weight: z.number().min(0).max(1),
            }),
          )
          .optional()
          .describe(
            "Variation weights. Each variation must appear exactly once and weights must sum to 1.",
          ),
        phaseName: z
          .string()
          .optional()
          .describe(
            "Override auto-generated phase name. Only meaningful when mode='newPhase'.",
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      experimentId,
      mode,
      targetingCondition,
      savedGroupTargeting,
      prerequisites,
      namespace,
      coverage,
      trafficSplit,
      phaseName,
    }) => {
      const hasUpdate =
        targetingCondition !== undefined ||
        savedGroupTargeting !== undefined ||
        prerequisites !== undefined ||
        namespace !== undefined ||
        coverage !== undefined ||
        trafficSplit !== undefined;

      if (!hasUpdate) {
        return {
          content: [
            {
              type: "text",
              text: "No targeting fields to update. Provide at least one of: targetingCondition, savedGroupTargeting, prerequisites, namespace, coverage, trafficSplit.",
            },
          ],
        };
      }

      const resolvedMode = mode ?? "newPhase";

      try {
        const getRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          { headers: buildHeaders(apiKey) },
        );
        await handleResNotOk(getRes);
        const getData = await getRes.json();
        const experiment = getData.experiment;

        if (experiment.status !== "running") {
          return {
            content: [
              {
                type: "text",
                text: `Cannot update targeting — current status is '${experiment.status}'. Only 'running' experiments support mid-flight targeting changes. Use start_experiment for drafts or update_experiment for non-targeting fields.`,
              },
            ],
          };
        }

        const existingPhases = [...(experiment.phases || [])];
        if (existingPhases.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Cannot update targeting — experiment has no existing phases. Use start_experiment first.",
              },
            ],
          };
        }

        if (trafficSplit) {
          const validVariationIds = new Set(
            experiment.variations.map((v: any) => v.variationId),
          );
          const uniqueSplitIds = new Set(
            trafficSplit.map((v: any) => v.variationId),
          );
          const totalWeight = trafficSplit.reduce(
            (sum: number, v: any) => sum + v.weight,
            0,
          );

          if (
            trafficSplit.length !== uniqueSplitIds.size ||
            uniqueSplitIds.size !== experiment.variations.length ||
            [...uniqueSplitIds].some((id) => !validVariationIds.has(id)) ||
            Math.abs(totalWeight - 1) > 1e-6
          ) {
            return {
              content: [
                {
                  type: "text",
                  text: "Invalid trafficSplit. Provide each variation exactly once (no duplicates) and ensure the weights sum to 1.",
                },
              ],
            };
          }
        }

        const existingPostPhases = existingPhases.map(getPhaseToPostPhase);
        const lastPhasePost = existingPostPhases[existingPostPhases.length - 1];

        const overrides: Record<string, any> = {};
        if (targetingCondition !== undefined)
          overrides.targetingCondition = targetingCondition;
        if (savedGroupTargeting !== undefined)
          overrides.savedGroupTargeting = savedGroupTargeting;
        if (prerequisites !== undefined)
          overrides.prerequisites = prerequisites;
        if (namespace !== undefined) overrides.namespace = namespace;
        if (coverage !== undefined) overrides.coverage = coverage;
        if (trafficSplit !== undefined) overrides.trafficSplit = trafficSplit;

        const now = new Date().toISOString();
        let phases: any[];

        if (resolvedMode === "newPhase") {
          const previousPhase = { ...lastPhasePost, dateEnded: now };
          const nextPhaseNumber = existingPostPhases.length + 1;
          const newPhase: Record<string, any> = {
            ...lastPhasePost,
            ...overrides,
            name: phaseName || `Phase ${nextPhaseNumber}`,
            dateStarted: now,
          };
          delete newPhase.dateEnded;
          delete newPhase.reason;
          phases = [
            ...existingPostPhases.slice(0, -1),
            previousPhase,
            newPhase,
          ];
        } else {
          const patchedPhase = { ...lastPhasePost, ...overrides };
          phases = [...existingPostPhases.slice(0, -1), patchedPhase];
        }

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ phases }),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatExperimentTargetingUpdated(
                data,
                appOrigin,
                resolvedMode,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `updating targeting for experiment '${experimentId}'`,
            [
              "The experiment must be in 'running' status.",
              "Use get_experiments to check status and current phase configuration.",
              "If trafficSplit is provided, weights must sum to 1 and cover every variation exactly once.",
            ],
          ),
        );
      }
    },
  );

  /**
   * Tool: stop_experiment
   */
  server.registerTool(
    "stop_experiment",
    {
      title: "Stop Experiment",
      description:
        "Stops a running experiment. To declare a winner, provide the releasedVariationId — use get_experiments with the experimentId first to see available variation IDs and their names. Set excludeFromPayload=true only when you're sure no SDK clients should see the experiment again — typically after a winner is declared.",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        releasedVariationId: z
          .string()
          .optional()
          .describe(
            "Variation ID to declare as winner. Use get_experiments to find variation IDs.",
          ),
        reason: z
          .string()
          .optional()
          .describe("Why the experiment was stopped"),
        excludeFromPayload: z
          .boolean()
          .optional()
          .default(false)
          .describe("Remove from SDK payloads after stopping (default: false)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      experimentId,
      releasedVariationId,
      reason,
      excludeFromPayload,
    }) => {
      try {
        const getRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          { headers: buildHeaders(apiKey) },
        );
        await handleResNotOk(getRes);
        const getData = await getRes.json();
        const experiment = getData.experiment;

        if (experiment.status !== "running") {
          return {
            content: [
              {
                type: "text",
                text: `Cannot stop experiment — current status is '${experiment.status}'. Only 'running' experiments can be stopped. Use get_experiments to check experiment status.`,
              },
            ],
          };
        }

        const phases = (experiment.phases || []).map(getPhaseToPostPhase);
        if (phases.length > 0) {
          const lastPhase = phases[phases.length - 1];
          lastPhase.dateEnded = new Date().toISOString();
          if (reason) lastPhase.reason = reason;
        }

        const payload: Record<string, any> = { status: "stopped", phases };
        if (releasedVariationId)
          payload.releasedVariationId = releasedVariationId;
        if (excludeFromPayload !== undefined)
          payload.excludeFromPayload = excludeFromPayload;

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatExperimentStopped(
                data,
                appOrigin,
                releasedVariationId,
                reason,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `stopping experiment '${experimentId}'`, [
            "The experiment must be in 'running' status.",
            "Use get_experiments to check the current status and find variation IDs.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: resume_experiment
   */
  server.registerTool(
    "resume_experiment",
    {
      title: "Resume Experiment",
      description:
        "Resumes a stopped experiment back to running status by appending a new phase. Optionally accepts targeting/coverage/trafficSplit overrides for the new phase — useful when resuming with a refined audience. Use start_experiment for drafts, update_experiment_targeting for already-running experiments. Common pattern: stop_experiment to pause, then resume_experiment to relaunch with adjusted parameters.",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        coverage: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Traffic coverage 0-1 for the new phase."),
        trafficSplit: z
          .array(
            z.object({
              variationId: z.string(),
              weight: z.number().min(0).max(1),
            }),
          )
          .optional()
          .describe(
            "Variation weights for the new phase. Each variation must appear exactly once and weights must sum to 1.",
          ),
        targetingCondition: jsonStringSchema(
          'targetingCondition must be a valid JSON string (e.g., \'{"country":"US"}\')',
        )
          .optional()
          .describe(
            "MongoDB-style targeting condition for the new phase, as a JSON string.",
          ),
        savedGroupTargeting: z
          .array(
            z.object({
              matchType: z.enum(["all", "any", "none"]),
              savedGroups: z.array(z.string()),
            }),
          )
          .optional()
          .describe("Saved group targeting rules for the new phase."),
        prerequisites: z
          .array(
            z.object({
              id: z.string(),
              condition: jsonStringSchema(
                "prerequisites[].condition must be a valid JSON string",
              ).describe(
                "MongoDB-style condition as a JSON string evaluated against the prerequisite flag's value.",
              ),
            }),
          )
          .optional()
          .describe("Prerequisite feature flags with conditions."),
        namespace: z
          .object({
            namespaceId: z.string(),
            range: z
              .array(z.unknown())
              .describe(
                "Two-number tuple [start, end] with values 0-1, e.g. [0, 0.5]",
              ),
          })
          .nullable()
          .optional()
          .describe(
            "Namespace targeting for the new phase. Pass null to clear an existing namespace.",
          ),
        phaseName: z
          .string()
          .optional()
          .describe("Override auto-generated phase name."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      experimentId,
      coverage,
      trafficSplit,
      targetingCondition,
      savedGroupTargeting,
      prerequisites,
      namespace,
      phaseName,
    }) => {
      try {
        const getRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          { headers: buildHeaders(apiKey) },
        );
        await handleResNotOk(getRes);
        const getData = await getRes.json();
        const experiment = getData.experiment;

        if (experiment.status !== "stopped") {
          let message: string;
          if (experiment.status === "running") {
            message =
              "Experiment is already running. Use update_experiment_targeting to change targeting without flipping status.";
          } else if (experiment.status === "draft") {
            message =
              "Experiment has never launched. Use start_experiment to launch a draft.";
          } else {
            message = `Cannot resume — current status is '${experiment.status}'. Only 'stopped' experiments can be resumed.`;
          }
          return { content: [{ type: "text", text: message }] };
        }

        if (trafficSplit) {
          const validVariationIds = new Set(
            experiment.variations.map((v: any) => v.variationId),
          );
          const uniqueSplitIds = new Set(
            trafficSplit.map((v: any) => v.variationId),
          );
          const totalWeight = trafficSplit.reduce(
            (sum: number, v: any) => sum + v.weight,
            0,
          );

          if (
            trafficSplit.length !== uniqueSplitIds.size ||
            uniqueSplitIds.size !== experiment.variations.length ||
            [...uniqueSplitIds].some((id) => !validVariationIds.has(id)) ||
            Math.abs(totalWeight - 1) > 1e-6
          ) {
            return {
              content: [
                {
                  type: "text",
                  text: "Invalid trafficSplit. Provide each variation exactly once (no duplicates) and ensure the weights sum to 1.",
                },
              ],
            };
          }
        }

        const existingPhases = [...(experiment.phases || [])];
        const existingPostPhases = existingPhases.map(getPhaseToPostPhase);

        const overrides: Record<string, any> = {};
        if (coverage !== undefined) overrides.coverage = coverage;
        if (trafficSplit !== undefined) overrides.trafficSplit = trafficSplit;
        if (targetingCondition !== undefined)
          overrides.targetingCondition = targetingCondition;
        if (savedGroupTargeting !== undefined)
          overrides.savedGroupTargeting = savedGroupTargeting;
        if (prerequisites !== undefined)
          overrides.prerequisites = prerequisites;
        if (namespace !== undefined) overrides.namespace = namespace;

        const lastPhasePost =
          existingPostPhases[existingPostPhases.length - 1] || {};
        const now = new Date().toISOString();
        const newPhase: Record<string, any> = {
          ...lastPhasePost,
          ...overrides,
          name: phaseName ?? `Phase ${existingPhases.length + 1}`,
          dateStarted: now,
        };
        delete newPhase.dateEnded;
        delete newPhase.reason;

        const phases = [...existingPostPhases, newPhase];

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ status: "running", phases }),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatExperimentResumed(data, appOrigin),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `resuming experiment '${experimentId}'`, [
            "The experiment must be in 'stopped' status.",
            "Use get_experiments to check the current status.",
            "If trafficSplit is provided, weights must sum to 1 and cover every variation exactly once.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: refresh_experiment_results
   */
  server.registerTool(
    "refresh_experiment_results",
    {
      title: "Refresh Experiment Results",
      description:
        "Triggers a fresh analysis snapshot for an experiment. Polls for completion and returns the latest results. Safe to call multiple times. Optionally pass a dimension ID to get results broken down by dimension (e.g., by country or UTM source). Use list_dimensions to find available dimension IDs. Pass a phase index ('0', '1', ...) to inspect results from a specific experiment phase (useful after update_experiment_targeting created new phases).",
      inputSchema: z.object({
        experimentId: z.string().describe("Experiment ID"),
        dimension: z
          .string()
          .optional()
          .describe(
            "Dimension ID to break down results (e.g., 'dim_abc123'). Use list_dimensions to find available IDs.",
          ),
        phase: z
          .string()
          .regex(
            /^\d+$/,
            "Phase must be a non-negative integer (e.g., '0', '1')",
          )
          .optional()
          .describe(
            "Phase index to retrieve results for a specific experiment phase (e.g., '0' for the first phase).",
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ experimentId, dimension, phase }) => {
      try {
        const snapshotRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}/snapshot`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ triggeredBy: "manual" }),
          },
        );
        await handleResNotOk(snapshotRes);
        const snapshotData = await snapshotRes.json();
        const snapshotId = snapshotData.snapshot?.id;

        if (!snapshotId) {
          throw new Error("No snapshot ID returned from the API.");
        }

        const delays = [1000, 2000, 4000, 8000, 16000];
        let status = "running";

        for (const delay of delays) {
          await new Promise((resolve) => setTimeout(resolve, delay));

          const pollRes = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/snapshots/${snapshotId}`,
            { headers: buildHeaders(apiKey) },
          );
          await handleResNotOk(pollRes);
          const pollData = await pollRes.json();
          status = pollData.snapshot?.status || "unknown";

          if (status !== "running") break;
        }

        if (status === "running") {
          return {
            content: [
              {
                type: "text",
                text: formatSnapshotResult(
                  experimentId,
                  "timeout",
                  appOrigin,
                  snapshotId,
                  dimension,
                ),
              },
            ],
          };
        }

        if (status !== "success") {
          return {
            content: [
              {
                type: "text",
                text: formatSnapshotResult(
                  experimentId,
                  "error",
                  appOrigin,
                  snapshotId,
                  dimension,
                ),
              },
            ],
          };
        }

        const resultsParams = new URLSearchParams();
        if (dimension) resultsParams.set("dimension", dimension);
        if (phase) resultsParams.set("phase", phase);
        const resultsQuery = resultsParams.toString();

        const resultsRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments/${experimentId}/results${resultsQuery ? `?${resultsQuery}` : ""}`,
          { headers: buildHeaders(apiKey, false) },
        );
        await handleResNotOk(resultsRes);
        const resultsData = await resultsRes.json();

        const content: { type: "text"; text: string }[] = [
          {
            type: "text",
            text: formatSnapshotResult(
              experimentId,
              "success",
              appOrigin,
              undefined,
              dimension,
            ),
          },
        ];

        if (resultsData.result) {
          content.push({
            type: "text",
            text:
              "```json\n" +
              JSON.stringify(resultsData.result, null, 2) +
              "\n```",
          });
        }

        return { content };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `refreshing results for experiment '${experimentId}'`,
            [
              "Check the experiment ID is correct.",
              "The experiment must have been running to have results.",
            ],
          ),
        );
      }
    },
  );
}
