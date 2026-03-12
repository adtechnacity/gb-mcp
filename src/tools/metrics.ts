import { z } from "zod";
import {
  ExtendedToolsInterface,
  handleResNotOk,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  buildHeaders,
} from "../utils.js";
import type {
  ListMetricsResponse,
  ListFactMetricsResponse,
  GetMetricResponse,
  GetFactMetricResponse,
} from "../api-type-helpers.js";
import {
  formatMetricsList,
  formatMetricDetail,
  formatApiError,
  formatFactMetricCreated,
  formatFactMetricUpdated,
  formatFactTableList,
  formatFactMetricList,
} from "../format-responses.js";

interface MetricsTools extends ExtendedToolsInterface {}

export function registerMetricsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: MetricsTools) {
  /**
   * Tool: get_metrics
   */
  server.registerTool(
    "get_metrics",
    {
      title: "Get Metrics",
      description:
        "Lists metrics in GrowthBook. Metrics measure experiment success (e.g., conversion rate, revenue per user). Two metric types: Fact metrics (IDs start with 'fact__') are modern and recommended for new setups; Legacy metrics are an older format, still supported. Use this to find metric IDs for analyzing experiments or understand available success measures. Single metric fetch includes full definition and GrowthBook link.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("The ID of the project to filter metrics by")
          .optional(),
        metricId: z
          .string()
          .describe("The ID of the metric to fetch")
          .optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent, project, metricId }) => {
      if (metricId) {
        try {
          let res;

          if (metricId.startsWith("fact__")) {
            res = await fetchWithRateLimit(
              `${baseApiUrl}/api/v1/fact-metrics/${metricId}`,
              {
                headers: buildHeaders(apiKey),
              },
            );
          } else {
            res = await fetchWithRateLimit(
              `${baseApiUrl}/api/v1/metrics/${metricId}`,
              {
                headers: buildHeaders(apiKey),
              },
            );
          }

          await handleResNotOk(res);

          const data = metricId.startsWith("fact__")
            ? ((await res.json()) as GetFactMetricResponse)
            : ((await res.json()) as GetMetricResponse);

          return {
            content: [
              {
                type: "text",
                text: formatMetricDetail(data, appOrigin),
              },
            ],
          };
        } catch (error) {
          throw new Error(
            formatApiError(error, `fetching metric '${metricId}'`, [
              "Check the metric ID is correct. Fact metric IDs start with 'fact__'.",
              "Use get_metrics without a metricId to list all available metrics.",
            ]),
          );
        }
      }

      try {
        const additionalParams = project ? { projectId: project } : undefined;

        const metricsData = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/metrics",
          limit,
          offset,
          mostRecent,
          additionalParams,
        )) as ListMetricsResponse;

        const factMetricData = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/fact-metrics",
          limit,
          offset,
          mostRecent,
          additionalParams,
        )) as ListFactMetricsResponse;

        // Reverse arrays for mostRecent to show newest-first
        if (mostRecent && offset === 0) {
          if (Array.isArray(metricsData.metrics)) {
            metricsData.metrics = metricsData.metrics.reverse();
          }
          if (Array.isArray(factMetricData.factMetrics)) {
            factMetricData.factMetrics = factMetricData.factMetrics.reverse();
          }
        }

        return {
          content: [
            {
              type: "text",
              text: formatMetricsList(metricsData, factMetricData),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching metrics", [
            "Check that your GB_API_KEY has permission to read metrics.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: create_fact_metric
   */
  server.registerTool(
    "create_fact_metric",
    {
      title: "Create Fact Metric",
      description:
        "Creates a new fact metric. Fact metrics are the modern metric type in GrowthBook, recommended for new setups. Use list_fact_tables to discover available fact table IDs.",
      inputSchema: z
        .object({
          name: z.string().describe("Metric name"),
          description: z.string().optional().describe("Description"),
          metricType: z
            .enum([
              "proportion",
              "mean",
              "quantile",
              "ratio",
              "retention",
              "dailyParticipation",
            ])
            .describe("Type of metric"),
          numerator: z
            .object({
              factTableId: z.string().describe("Fact table ID"),
              column: z
                .string()
                .optional()
                .describe("Column name (for mean/quantile metrics)"),
              filters: z
                .array(z.string())
                .optional()
                .describe("Filter IDs to apply"),
            })
            .describe("Numerator configuration"),
          denominator: z
            .object({
              factTableId: z.string().describe("Fact table ID"),
              column: z.string().optional().describe("Column name"),
              filters: z
                .array(z.string())
                .optional()
                .describe("Filter IDs to apply"),
            })
            .optional()
            .describe("Denominator configuration (required for ratio metrics)"),
          tags: z.array(z.string()).optional().describe("Tags"),
          projects: z.array(z.string()).optional().describe("Project IDs"),
          owner: z
            .string()
            .optional()
            .describe("Owner email (defaults to current user)"),
        })
        .superRefine((value, ctx) => {
          if (value.metricType === "ratio" && !value.denominator) {
            ctx.addIssue({
              code: "custom",
              path: ["denominator"],
              message: "denominator is required when metricType is 'ratio'",
            });
          }
        }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      name,
      description,
      metricType,
      numerator,
      denominator,
      tags,
      projects,
      owner: metricOwner,
    }) => {
      try {
        const payload: Record<string, any> = {
          name,
          metricType,
          numerator,
        };
        if (description !== undefined) payload.description = description;
        if (denominator !== undefined) payload.denominator = denominator;
        if (tags !== undefined) payload.tags = tags;
        if (projects !== undefined) payload.projects = projects;
        payload.owner = metricOwner || user;

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-metrics`,
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
            { type: "text", text: formatFactMetricCreated(data, appOrigin) },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `creating fact metric '${name}'`, [
            "Use list_fact_tables to find valid fact table IDs.",
            "Ratio metrics require a denominator.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: update_fact_metric
   */
  server.registerTool(
    "update_fact_metric",
    {
      title: "Update Fact Metric",
      description:
        "Updates an existing fact metric. Only the provided fields are changed.",
      inputSchema: z.object({
        metricId: z.string().describe("Fact metric ID (starts with 'fact__')"),
        name: z.string().optional().describe("Updated name"),
        description: z.string().optional().describe("Updated description"),
        metricType: z
          .enum([
            "proportion",
            "mean",
            "quantile",
            "ratio",
            "retention",
            "dailyParticipation",
          ])
          .optional()
          .describe("Updated metric type"),
        numerator: z
          .object({
            factTableId: z.string().describe("Fact table ID"),
            column: z.string().optional(),
            filters: z.array(z.string()).optional(),
          })
          .optional()
          .describe("Updated numerator"),
        denominator: z
          .object({
            factTableId: z.string().describe("Fact table ID"),
            column: z.string().optional(),
            filters: z.array(z.string()).optional(),
          })
          .optional()
          .describe("Updated denominator"),
        tags: z.array(z.string()).optional(),
        projects: z.array(z.string()).optional(),
        owner: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ metricId, ...fields }) => {
      try {
        const payload: Record<string, any> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) payload[key] = value;
        }

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-metrics/${metricId}`,
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
            { type: "text", text: formatFactMetricUpdated(data, appOrigin) },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `updating fact metric '${metricId}'`, [
            "Check the metric ID is correct (should start with 'fact__').",
            "Use get_metrics to list available metrics.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: list_fact_tables
   */
  server.registerTool(
    "list_fact_tables",
    {
      title: "List Fact Tables",
      description:
        "Lists available fact tables. Fact tables define the SQL data sources that fact metrics reference. Use this to discover fact table IDs before creating metrics with create_fact_metric.",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(100)
          .describe("Number of items to fetch (1-100)"),
        offset: z
          .number()
          .min(0)
          .default(0)
          .describe("Number of items to skip"),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables?${queryParams.toString()}`,
          { headers: buildHeaders(apiKey) },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactTableList(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching fact tables", [
            "Check that your GB_API_KEY has permission to read fact tables.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: list_fact_metrics
   */
  server.registerTool(
    "list_fact_metrics",
    {
      title: "List Fact Metrics",
      description:
        "Lists fact metrics with their full configuration. Unlike get_metrics which returns both legacy and fact metrics in a summary, this returns only fact metrics with type, numerator, and denominator details.",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(100)
          .describe("Number of items to fetch (1-100)"),
        offset: z
          .number()
          .min(0)
          .default(0)
          .describe("Number of items to skip"),
        projectId: z.string().optional().describe("Filter by project ID"),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, projectId }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        if (projectId) queryParams.append("projectId", projectId);

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-metrics?${queryParams.toString()}`,
          { headers: buildHeaders(apiKey) },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactMetricList(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching fact metrics", [
            "Check that your GB_API_KEY has permission to read fact metrics.",
          ]),
        );
      }
    },
  );
}
