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
  formatFactMetricDeleted,
  formatFactTableList,
  formatFactTableCreated,
  formatFactTableUpdated,
  formatFactTableDeleted,
  formatFactMetricList,
  formatFactTableFilterList,
  formatFactTableFilterCreated,
  formatFactTableFilterDeleted,
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

        const [metricsData, factMetricData] = (await Promise.all([
          fetchWithPagination(
            baseApiUrl,
            apiKey,
            "/api/v1/metrics",
            limit,
            offset,
            mostRecent,
            additionalParams,
          ),
          fetchWithPagination(
            baseApiUrl,
            apiKey,
            "/api/v1/fact-metrics",
            limit,
            offset,
            mostRecent,
            additionalParams,
          ),
        ])) as [ListMetricsResponse, ListFactMetricsResponse];

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

  /**
   * Tool: create_fact_table
   */
  server.registerTool(
    "create_fact_table",
    {
      title: "Create Fact Table",
      description:
        "Creates a new fact table. Fact tables define the SQL data sources that fact metrics reference. Requires a name, datasource ID, user ID types, and SQL query.",
      inputSchema: z.object({
        name: z.string().describe("Fact table name"),
        description: z.string().optional().describe("Description"),
        datasource: z.string().describe("Datasource ID"),
        userIdTypes: z
          .array(z.string())
          .describe("User ID types (e.g. ['user_id'])"),
        sql: z.string().describe("SQL query that defines the fact table"),
        eventName: z
          .string()
          .optional()
          .describe("Column name used as the event name"),
        tags: z.array(z.string()).optional().describe("Tags"),
        projects: z.array(z.string()).optional().describe("Project IDs"),
        owner: z
          .string()
          .optional()
          .describe("Owner email (defaults to current user)"),
        managedBy: z.string().optional().describe("Managed by (e.g. 'api')"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      name,
      description,
      datasource,
      userIdTypes,
      sql,
      eventName,
      tags,
      projects,
      owner: tableOwner,
      managedBy,
    }) => {
      try {
        const payload: Record<string, any> = {
          name,
          datasource,
          userIdTypes,
          sql,
        };
        if (description !== undefined) payload.description = description;
        if (eventName !== undefined) payload.eventName = eventName;
        if (tags !== undefined) payload.tags = tags;
        if (projects !== undefined) payload.projects = projects;
        if (managedBy !== undefined) payload.managedBy = managedBy;
        payload.owner = tableOwner || user;

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables`,
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
            { type: "text", text: formatFactTableCreated(data, appOrigin) },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `creating fact table '${name}'`, [
            "Check that the datasource ID is valid.",
            "Use list_fact_tables to see existing fact tables.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: update_fact_table
   */
  server.registerTool(
    "update_fact_table",
    {
      title: "Update Fact Table",
      description:
        "Updates an existing fact table. Only the provided fields are changed. Use this to update the SQL query, columns, name, or other properties.",
      inputSchema: z.object({
        factTableId: z.string().describe("Fact table ID (starts with 'ftb_')"),
        name: z.string().optional().describe("Updated name"),
        description: z.string().optional().describe("Updated description"),
        sql: z.string().optional().describe("Updated SQL query"),
        userIdTypes: z
          .array(z.string())
          .optional()
          .describe("Updated user ID types"),
        eventName: z.string().optional().describe("Updated event name column"),
        columns: z
          .array(
            z.object({
              column: z.string().describe("Column name from SQL"),
              name: z.string().describe("Display name"),
              description: z.string().optional().describe("Column description"),
              numberFormat: z
                .string()
                .optional()
                .describe(
                  "Number format (e.g. '', 'currency', 'time:seconds')",
                ),
              datatype: z
                .enum(["", "boolean", "number", "string", "unknown"])
                .describe("Column data type"),
              deleted: z
                .boolean()
                .optional()
                .describe("Whether column is deleted"),
              alwaysInlineFilter: z
                .boolean()
                .optional()
                .describe("Always include as inline filter"),
            }),
          )
          .optional()
          .describe(
            "Column definitions with names, types, and display settings. Use this to set column datatypes after creating a fact table.",
          ),
        tags: z.array(z.string()).optional(),
        projects: z.array(z.string()).optional(),
        owner: z.string().optional(),
        managedBy: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ factTableId, ...fields }) => {
      try {
        const payload: Record<string, any> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) payload[key] = value;
        }

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables/${factTableId}`,
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
            { type: "text", text: formatFactTableUpdated(data, appOrigin) },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `updating fact table '${factTableId}'`, [
            "Check the fact table ID is correct (should start with 'ftb_').",
            "Use list_fact_tables to list available fact tables.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: delete_fact_table
   */
  server.registerTool(
    "delete_fact_table",
    {
      title: "Delete Fact Table",
      description:
        "Deletes a fact table. This is destructive — all fact metrics referencing this table will lose their data source. Use list_fact_metrics to check for dependent metrics before deleting.",
      inputSchema: z.object({
        factTableId: z
          .string()
          .describe("Fact table ID to delete (starts with 'ftb_')"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ factTableId }) => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables/${factTableId}`,
          {
            method: "DELETE",
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactTableDeleted(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `deleting fact table '${factTableId}'`, [
            "Check the fact table ID is correct.",
            "Ensure no fact metrics depend on this table, or delete them first.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: delete_fact_metric
   */
  server.registerTool(
    "delete_fact_metric",
    {
      title: "Delete Fact Metric",
      description:
        "Deletes a fact metric. This is destructive — experiments referencing this metric will lose it. Check experiment assignments before deleting.",
      inputSchema: z.object({
        metricId: z
          .string()
          .describe("Fact metric ID to delete (starts with 'fact__')"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ metricId }) => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-metrics/${metricId}`,
          {
            method: "DELETE",
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactMetricDeleted(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `deleting fact metric '${metricId}'`, [
            "Check the metric ID is correct (should start with 'fact__').",
            "Ensure no active experiments reference this metric.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: list_fact_table_filters
   */
  server.registerTool(
    "list_fact_table_filters",
    {
      title: "List Fact Table Filters",
      description:
        "Lists saved filters on a fact table. Filters are reusable SQL WHERE clause fragments that can be referenced by fact metrics.",
      inputSchema: z.object({
        factTableId: z.string().describe("Fact table ID (starts with 'ftb_')"),
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
    async ({ factTableId, limit, offset }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables/${factTableId}/filters?${queryParams.toString()}`,
          { headers: buildHeaders(apiKey) },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactTableFilterList(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `fetching filters for fact table '${factTableId}'`,
            [
              "Check the fact table ID is correct (should start with 'ftb_').",
              "Use list_fact_tables to find valid fact table IDs.",
            ],
          ),
        );
      }
    },
  );

  /**
   * Tool: create_fact_table_filter
   */
  server.registerTool(
    "create_fact_table_filter",
    {
      title: "Create Fact Table Filter",
      description:
        "Creates a saved filter on a fact table. Filters are reusable SQL WHERE clause fragments (e.g., \"event_name = 'purchase'\") that can be referenced by ID in fact metric numerator/denominator configurations.",
      inputSchema: z.object({
        factTableId: z
          .string()
          .describe(
            "Fact table ID to create the filter on (starts with 'ftb_')",
          ),
        name: z.string().describe("Filter name (e.g., 'Purchase Events')"),
        description: z.string().optional().describe("Description"),
        value: z
          .string()
          .describe(
            "SQL WHERE clause fragment (e.g., \"event_name = 'purchase'\")",
          ),
        managedBy: z
          .enum(["", "api"])
          .optional()
          .describe("Set to 'api' to prevent UI edits"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ factTableId, name, description, value, managedBy }) => {
      try {
        const payload: Record<string, any> = { name, value };
        if (description !== undefined) payload.description = description;
        if (managedBy !== undefined) payload.managedBy = managedBy;

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables/${factTableId}/filters`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactTableFilterCreated(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `creating filter '${name}' on fact table '${factTableId}'`,
            [
              "Check the fact table ID is correct.",
              "The value should be a valid SQL WHERE clause fragment.",
            ],
          ),
        );
      }
    },
  );

  /**
   * Tool: delete_fact_table_filter
   */
  server.registerTool(
    "delete_fact_table_filter",
    {
      title: "Delete Fact Table Filter",
      description:
        "Deletes a saved filter from a fact table. This is destructive — any fact metrics referencing this filter ID will lose it.",
      inputSchema: z.object({
        factTableId: z.string().describe("Fact table ID (starts with 'ftb_')"),
        filterId: z.string().describe("Filter ID to delete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ factTableId, filterId }) => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables/${factTableId}/filters/${filterId}`,
          {
            method: "DELETE",
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatFactTableFilterDeleted(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `deleting filter '${filterId}' from fact table '${factTableId}'`,
            [
              "Check both the fact table ID and filter ID are correct.",
              "Use list_fact_table_filters to see available filters.",
            ],
          ),
        );
      }
    },
  );
}
