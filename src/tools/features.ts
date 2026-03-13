import { z } from "zod";
import {
  getDocsMetadata,
  handleResNotOk,
  type ExtendedToolsInterface,
  paginationSchema,
  featureFlagSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  fetchFeatureFlag,
  mergeRuleIntoFeatureFlag,
  buildHeaders,
} from "../utils.js";
import type { GetStaleFeatureResponse } from "../api-type-helpers.js";
import {
  formatFeatureFlagList,
  formatFeatureFlagDetail,
  formatFeatureFlagCreated,
  formatFeatureFlagUpdated,
  formatFeatureFlagToggled,
  formatFeatureRuleAdded,
  formatFeatureRulesReordered,
  formatFeatureRuleRemoved,
  formatForceRuleCreated,
  formatStaleFeatureFlags,
  formatApiError,
} from "../format-responses.js";
import { execFile } from "child_process";
import { getDefaults } from "./defaults.js";

interface FeatureTools extends ExtendedToolsInterface {}

export function registerFeatureTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: FeatureTools) {
  /**
   * Tool: create_feature_flag
   */
  server.registerTool(
    "create_feature_flag",
    {
      title: "Create Feature Flag",
      description:
        "Creates a new feature flag in GrowthBook. Feature flags control access to features by returning different values based on rules. Use when adding a toggleable feature to your codebase, creating a flag for A/B testing (then use create_experiment), or setting up gradual rollouts. The flag is created DISABLED in all environments. After creation, use create_force_rule to add targeting conditions, or create_experiment for A/B testing. Returns flag details and SDK integration code snippets for the specified language.",
      inputSchema: featureFlagSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      id,
      valueType,
      defaultValue,
      description,
      project,
      fileExtension,
      customFields,
    }) => {
      // get environments
      let environments = [];
      const defaults = await getDefaults(apiKey, baseApiUrl);
      if (defaults.environments) {
        environments = defaults.environments;
      } else {
        const envRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/environments`,
          {
            headers: buildHeaders(apiKey),
          },
        );
        await handleResNotOk(envRes);
        const envData = await envRes.json();
        environments = envData.environments.map((env: any) => env.id);
      }

      const payload = {
        id,
        description,
        owner: user,
        valueType,
        defaultValue,
        tags: ["mcp"],
        environments: environments.reduce(
          (acc: Record<string, any>, env: string) => {
            acc[env] = {
              enabled: false,
              rules: [],
            };
            return acc;
          },
          {},
        ),
        ...(project && { project }),
        ...(customFields && { customFields }),
      };

      try {
        const res = await fetchWithRateLimit(`${baseApiUrl}/api/v1/features`, {
          method: "POST",
          headers: buildHeaders(apiKey),
          body: JSON.stringify(payload),
        });

        await handleResNotOk(res);

        const data = await res.json();
        const { docs, language, stub } = getDocsMetadata(fileExtension);

        return {
          content: [
            {
              type: "text",
              text: formatFeatureFlagCreated(
                data,
                appOrigin,
                stub,
                language,
                docs,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `creating feature flag '${id}'`, [
            "Check the id is valid (letters, numbers, _, -, ., :, | only).",
            "A flag with this id may already exist — use get_feature_flags to check.",
            "If scoping to a project, verify the project id with get_projects.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: create_force_rule
   */
  server.registerTool(
    "create_force_rule",
    {
      title: "Create Force Rule",
      description:
        'Adds a targeting rule to an existing feature flag that forces a specific value when conditions are met. This applies the rule to ALL default environments. For per-environment control, use add_feature_rule instead. Use this for targeting specific users or segments without running an experiment. Example conditions (MongoDB-style syntax): Users in Canada: {"country": "CA"}, Beta testers: {"betaTester": true}, Specific IDs: {"id": {"$in": ["user1", "user2"]}}. Prerequisites: Feature flag must exist - create it first with create_feature_flag if needed. Common operators: $eq, $ne, $in, $nin, $gt, $lt, $regex. Do NOT use for A/B testing - use create_experiment instead for statistical analysis.',
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        description: featureFlagSchema.description.optional().default(""),
        fileExtension: featureFlagSchema.fileExtension,
        condition: z
          .string()
          .describe(
            'MongoDB-style targeting condition. Examples: {"country": "US"}, {"plan": {"$in": ["pro", "enterprise"]}}. Omit to apply to all users.',
          )
          .optional(),
        value: z
          .string()
          .describe(
            "The value to force when condition matches. Must match the flag's valueType (string, number, boolean, or JSON string).",
          ),
      }),
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({ featureId, description, condition, value, fileExtension }) => {
      try {
        // Fetch the existing feature flag first to preserve existing rules
        const existingFeature = await fetchFeatureFlag(
          baseApiUrl,
          apiKey,
          featureId,
        );

        // Fetch feature defaults first
        const defaults = await getDefaults(apiKey, baseApiUrl);
        const defaultEnvironments = defaults.environments;

        // Create new force rule
        const newRule = {
          type: "force",
          description,
          condition,
          value,
        };

        // Merge new rule into existing feature flag
        const payload = mergeRuleIntoFeatureFlag(
          existingFeature,
          newRule,
          defaultEnvironments,
        );

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          },
        );

        await handleResNotOk(res);

        const data = await res.json();
        const { docs, language, stub } = getDocsMetadata(fileExtension);

        return {
          content: [
            {
              type: "text",
              text: formatForceRuleCreated(
                data,
                appOrigin,
                featureId,
                stub,
                language,
                docs,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `adding rule to '${featureId}'`, [
            `Check that feature flag '${featureId}' exists — use get_feature_flags to verify.`,
            'Ensure the value matches the flag\'s valueType (e.g. "true" for boolean flags).',
            'For condition syntax, use MongoDB-style JSON: {"country": "US"}',
          ]),
        );
      }
    },
  );

  /**
   * Tool: get_feature_flags
   */
  server.registerTool(
    "get_feature_flags",
    {
      title: "Get Feature Flags",
      description:
        "Lists feature flags with full details (rules, environments, values) or fetches a single flag by ID. Returns up to 100 flags per page. Use to inspect flag configuration, rules, and status. For a lightweight list of all flag IDs (no limit), use list_feature_keys instead.",
      inputSchema: z.object({
        project: featureFlagSchema.project.optional(),
        featureFlagId: featureFlagSchema.id.optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent, project, featureFlagId }) => {
      // Fetch single feature flag
      if (featureFlagId) {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/features/${featureFlagId}`,
            {
              headers: buildHeaders(apiKey),
            },
          );

          await handleResNotOk(res);

          const data = await res.json();

          return {
            content: [
              { type: "text", text: formatFeatureFlagDetail(data, appOrigin) },
            ],
          };
        } catch (error) {
          throw new Error(
            formatApiError(error, `fetching feature flag '${featureFlagId}'`, [
              "Check the feature flag id is correct.",
              "Use get_feature_flags without a featureFlagId to list all available flags.",
            ]),
          );
        }
      }

      // Fetch multiple feature flags
      try {
        const data = await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/features",
          limit,
          offset,
          mostRecent,
          project ? { projectId: project } : undefined,
        );

        // Reverse features array for mostRecent to show newest-first
        if (mostRecent && offset === 0 && Array.isArray(data.features)) {
          data.features = data.features.reverse();
        }

        return {
          content: [{ type: "text", text: formatFeatureFlagList(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching feature flags", [
            "Check that your GB_API_KEY has permission to read features.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: list_feature_keys
   */
  server.registerTool(
    "list_feature_keys",
    {
      title: "List Feature Keys",
      description:
        "Returns all feature flag IDs (keys only, no details) in your GrowthBook organization. Useful for discovering flag IDs when you need to check a large number of flags — for example, before calling get_stale_feature_flags. Optionally filter by project.",
      inputSchema: z.object({
        projectId: z
          .string()
          .optional()
          .describe(
            "Filter by project ID to only return flags in that project.",
          ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ projectId }) => {
      try {
        const queryParams = projectId
          ? `?projectId=${encodeURIComponent(projectId)}`
          : "";
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/feature-keys${queryParams}`,
          {
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);

        const keys = (await res.json()) as string[];

        return {
          content: [
            {
              type: "text",
              text: `**${keys.length} feature flag(s) found${projectId ? ` in project \`${projectId}\`` : ""}:**\n\n${keys.map((k) => `\`${k}\``).join(", ")}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching feature keys", [
            "Check that your GB_API_KEY has permission to read features.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: get_stale_feature_flags
   */
  server.registerTool(
    "get_stale_feature_flags",
    {
      title: "Get Stale Feature Flags",
      description:
        "Given a list of feature flag IDs, checks whether each one is stale and returns cleanup guidance including replacement values and SDK search patterns. You MUST provide featureIds — gather them first from the user, from the current file context, or by using list_feature_keys to get all flag IDs and then searching the codebase for those IDs to determine which are present.",
      inputSchema: z.object({
        featureIds: z
          .array(z.string())
          .optional()
          .describe(
            'REQUIRED. One or more feature flag IDs to check (e.g. ["my-feature", "dark-mode"]). Gather IDs first from the user, from code context, or by using list_feature_keys to get all flag IDs and searching the codebase for those IDs.',
          ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ featureIds }) => {
      try {
        if (!featureIds?.length) {
          return {
            content: [
              {
                type: "text",
                text: [
                  "**featureIds is required.** This tool checks specific flags — it does not list all stale flags.",
                  "",
                  "To gather feature flag IDs, try one of these approaches:",
                  "1. **Ask the user** which flags they want to check",
                  "2. **Extract from current file context** — look for flag IDs in the open file",
                  "3. **Use the `list_feature_keys` tool** to get all flag IDs, then search the codebase for those IDs to determine which are present",
                  "",
                  "Then call this tool again with the discovered flag IDs.",
                ].join("\n"),
              },
            ],
          };
        }

        const ids = featureIds.join(",");
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/stale-features?ids=${encodeURIComponent(ids)}`,
          {
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);

        const data = (await res.json()) as GetStaleFeatureResponse;

        const text = formatStaleFeatureFlags(data, featureIds);

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "checking stale features", [
            "Check that the feature IDs are correct.",
            "Check that your GB_API_KEY has permission to read features.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: generate_flag_types
   */
  server.registerTool(
    "generate_flag_types",
    {
      title: "Generate Flag Types",
      description:
        "Generates TypeScript type definitions for all feature flags. Provides type safety and IDE autocomplete when accessing flags in code. Prerequisites: Target project must be TypeScript; GrowthBook CLI installed via npx (automatic). Run after creating new flags or when flag value types change. Returns the generated types file location.",
      inputSchema: z.object({
        currentWorkingDirectory: z
          .string()
          .describe("The current working directory of the user's project"),
      }),
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async ({ currentWorkingDirectory }) => {
      function runCommand(args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
          execFile("npx", args, { cwd }, (error, stdout, stderr) => {
            if (error) {
              reject(stderr || error.message);
            } else {
              resolve(stdout);
            }
          });
        });
      }
      try {
        // Login command
        await runCommand(
          [
            "-y",
            "growthbook@latest",
            "auth",
            "login",
            "-k",
            apiKey,
            "-u",
            baseApiUrl,
            "-p",
            "default",
          ],
          currentWorkingDirectory,
        );
        // Generate types command
        const output = await runCommand(
          [
            "-y",
            "growthbook@latest",
            "features",
            "generate-types",
            "-u",
            baseApiUrl,
          ],
          currentWorkingDirectory,
        );
        return {
          content: [
            {
              type: "text",
              text: `✅ Types generated successfully:\n${output}. Offer to add a script to the project's package.json file to regenerate types when needed. The command is:
              "npx -y growthbook@latest features generate-types -u ${baseApiUrl}"`,
            },
          ],
        };
      } catch (error: any) {
        throw new Error(`Error generating types: ${error}`);
      }
    },
  );

  /**
   * Tool: update_feature_flag
   */
  server.registerTool(
    "update_feature_flag",
    {
      title: "Update Feature Flag",
      description:
        "Updates properties of an existing feature flag. Only the provided fields are changed — omitted fields remain unchanged. Use toggle_feature_flag to enable/disable per-environment, add_feature_rule to add targeting rules, or reorder_feature_rules / remove_feature_rule to manage existing rules.",
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        description: featureFlagSchema.description.optional(),
        owner: z.string().optional().describe("Updated owner email"),
        project: featureFlagSchema.project.optional(),
        tags: z.array(z.string()).optional().describe("Replace the tags array"),
        archived: z
          .boolean()
          .optional()
          .describe("Archive (true) or unarchive (false) the flag"),
        defaultValue: z
          .string()
          .optional()
          .describe("New default value (must match the flag's valueType)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      featureId,
      description,
      owner,
      project,
      tags,
      archived,
      defaultValue,
    }) => {
      try {
        const payload: Record<string, any> = {};
        if (description !== undefined) payload.description = description;
        if (owner !== undefined) payload.owner = owner;
        if (project !== undefined) payload.project = project;
        if (tags !== undefined) payload.tags = tags;
        if (archived !== undefined) payload.archived = archived;
        if (defaultValue !== undefined) payload.defaultValue = defaultValue;

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}`,
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
              text: formatFeatureFlagUpdated(data, appOrigin),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `updating feature flag '${featureId}'`, [
            "Check that the feature flag exists — use get_feature_flags to verify.",
            "Ensure defaultValue matches the flag's valueType.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: toggle_feature_flag
   */
  server.registerTool(
    "toggle_feature_flag",
    {
      title: "Toggle Feature Flag",
      description:
        "Enables or disables a feature flag in specific environments. Provide a map of environment names to their desired state (true=ON, false=OFF). Use get_environments to discover available environment names.",
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        environments: z
          .record(z.string(), z.boolean())
          .describe(
            'Map of environment name to desired state. Example: {"production": true, "staging": false}',
          ),
        reason: z
          .string()
          .optional()
          .describe("Audit trail explanation for the toggle (recommended)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ featureId, environments, reason }) => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}/toggle`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ reason, environments }),
          },
        );
        await handleResNotOk(res);
        return {
          content: [
            {
              type: "text",
              text: formatFeatureFlagToggled(featureId, environments),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `toggling feature flag '${featureId}'`, [
            "Check environment names with get_environments.",
            "Verify the feature flag exists with get_feature_flags.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: add_feature_rule
   */
  server.registerTool(
    "add_feature_rule",
    {
      title: "Add Feature Rule",
      description:
        "Adds a targeting rule to a specific environment on a feature flag. Use get_environments to discover environment IDs. For rules across all default environments, use create_force_rule instead. Supports 'force' rules (serve a specific value) and 'rollout' rules (gradual percentage rollout).",
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        environment: z
          .string()
          .describe("Single environment ID (e.g., 'production')"),
        ruleType: z.enum(["force", "rollout"]).describe("Type of rule to add"),
        value: z
          .string()
          .describe(
            "Value to serve when rule matches (force) or rollout value",
          ),
        condition: z
          .string()
          .optional()
          .describe(
            'MongoDB-style targeting condition. Example: {"country": "US"}',
          ),
        coverage: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Traffic percentage 0-1 for rollout rules"),
        hashAttribute: z
          .string()
          .optional()
          .default("id")
          .describe("Attribute for bucketing rollout users (default: 'id')"),
        description: z.string().optional().describe("Rule description"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({
      featureId,
      environment,
      ruleType,
      value,
      condition,
      coverage,
      hashAttribute,
      description: ruleDescription,
    }) => {
      try {
        const existingFeature = await fetchFeatureFlag(
          baseApiUrl,
          apiKey,
          featureId,
        );
        const existingEnvironments = existingFeature?.environments || {};

        const newRule: Record<string, any> = {
          type: ruleType,
          value,
          ...(condition && { condition }),
          ...(ruleDescription && { description: ruleDescription }),
        };

        if (ruleType === "rollout") {
          newRule.coverage = coverage ?? 1;
          newRule.hashAttribute = hashAttribute || "id";
        }

        const updatedEnvironments: Record<string, any> = {};
        for (const [env, config] of Object.entries(existingEnvironments)) {
          const envConfig = config as Record<string, any>;
          if (env === environment) {
            updatedEnvironments[env] = {
              ...envConfig,
              rules: [...(envConfig.rules || []), newRule],
            };
          } else {
            updatedEnvironments[env] = envConfig;
          }
        }

        if (!updatedEnvironments[environment]) {
          updatedEnvironments[environment] = {
            enabled: false,
            rules: [newRule],
          };
        }

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ environments: updatedEnvironments }),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatFeatureRuleAdded(
                data,
                appOrigin,
                environment,
                ruleType,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `adding rule to '${featureId}' in ${environment}`,
            [
              `Check that feature flag '${featureId}' exists — use get_feature_flags to verify.`,
              "Check environment name with get_environments.",
              "Ensure the value matches the flag's valueType.",
            ],
          ),
        );
      }
    },
  );

  /**
   * Tool: reorder_feature_rules
   */
  server.registerTool(
    "reorder_feature_rules",
    {
      title: "Reorder Feature Rules",
      description:
        "Sets the evaluation order of rules for a specific environment on a feature flag. Rules are evaluated top-to-bottom — the first matching rule wins. Use get_feature_flags with featureFlagId to see current rules and their IDs.",
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        environment: z.string().describe("Environment ID"),
        ruleIds: z
          .array(z.string())
          .describe(
            "Rule IDs in desired evaluation order. All existing rule IDs for the environment must be included.",
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ featureId, environment, ruleIds }) => {
      try {
        const existingFeature = await fetchFeatureFlag(
          baseApiUrl,
          apiKey,
          featureId,
        );
        const envConfig = existingFeature?.environments?.[environment];
        if (!envConfig) {
          throw new Error(
            `Environment '${environment}' not found on feature flag '${featureId}'.`,
          );
        }

        const existingRules = envConfig.rules || [];
        const ruleMap = new Map(existingRules.map((r: any) => [r.id, r]));
        const uniqueRuleIds = new Set(ruleIds);

        if (uniqueRuleIds.size !== ruleIds.length) {
          throw new Error("Duplicate rule IDs are not allowed.");
        }

        if (uniqueRuleIds.size !== existingRules.length) {
          throw new Error(
            `Expected ${existingRules.length} rule IDs but received ${ruleIds.length}. All existing rule IDs for the environment must be included.`,
          );
        }

        for (const id of uniqueRuleIds) {
          if (!ruleMap.has(id)) {
            throw new Error(
              `Rule '${id}' not found in environment '${environment}'.`,
            );
          }
        }

        const reorderedRules = ruleIds.map((id) => ruleMap.get(id)!);

        const updatedEnvironments = {
          ...existingFeature.environments,
          [environment]: { ...envConfig, rules: reorderedRules },
        };

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ environments: updatedEnvironments }),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatFeatureRulesReordered(
                data,
                appOrigin,
                environment,
                ruleIds,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `reordering rules for '${featureId}' in ${environment}`,
            [
              "Use get_feature_flags with the featureFlagId to see current rules and their IDs.",
              "All existing rule IDs for the environment must be included.",
            ],
          ),
        );
      }
    },
  );

  /**
   * Tool: remove_feature_rule
   */
  server.registerTool(
    "remove_feature_rule",
    {
      title: "Remove Feature Rule",
      description:
        "Removes a specific rule from an environment on a feature flag. This permanently deletes the rule — it cannot be undone (the rule must be manually recreated). Use get_feature_flags with featureFlagId to see current rules and their IDs.",
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        environment: z.string().describe("Environment ID"),
        ruleId: z.string().describe("The ID of the rule to remove"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ featureId, environment, ruleId }) => {
      try {
        const existingFeature = await fetchFeatureFlag(
          baseApiUrl,
          apiKey,
          featureId,
        );
        const envConfig = existingFeature?.environments?.[environment];
        if (!envConfig) {
          throw new Error(
            `Environment '${environment}' not found on feature flag '${featureId}'.`,
          );
        }

        const existingRules = envConfig.rules || [];
        const filteredRules = existingRules.filter((r: any) => r.id !== ruleId);

        if (filteredRules.length === existingRules.length) {
          throw new Error(
            `Rule '${ruleId}' not found in environment '${environment}'.`,
          );
        }

        const updatedEnvironments = {
          ...existingFeature.environments,
          [environment]: { ...envConfig, rules: filteredRules },
        };

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ environments: updatedEnvironments }),
          },
        );
        await handleResNotOk(res);
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: formatFeatureRuleRemoved(
                data,
                appOrigin,
                environment,
                ruleId,
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `removing rule '${ruleId}' from '${featureId}' in ${environment}`,
            [
              "Use get_feature_flags with the featureFlagId to see current rules and their IDs.",
            ],
          ),
        );
      }
    },
  );
}
