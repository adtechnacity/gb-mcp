import { z } from "zod";
import {
  type BaseToolsInterface,
  paginationSchema,
  fetchWithPagination,
  fetchWithRateLimit,
  buildHeaders,
  handleResNotOk,
} from "../utils.js";
import type {
  ListDataSourcesResponse,
  GetDataSourceResponse,
} from "../api-type-helpers.js";
import {
  formatDataSources,
  formatDataSourceDetail,
  formatApiError,
} from "../format-responses.js";

interface DataSourceTools extends BaseToolsInterface {}

/**
 * Tool: get_data_sources
 */
export function registerDataSourceTools({
  server,
  baseApiUrl,
  apiKey,
}: DataSourceTools) {
  server.registerTool(
    "get_data_sources",
    {
      title: "Get Data Sources",
      description:
        "Lists data sources (warehouses GrowthBook queries for experiment analysis) or fetches one by ID. Returns name, type, linked projects, identifier types, and — in single-ID mode — the full exposure/assignment query SQL. Use this to find the datasource ID needed by create_fact_table and create_dimension, or to audit how experiment exposure is queried. Note: connection settings (host, credentials) are write- and read-protected — the API never exposes them and they can only be changed in the GrowthBook UI (Settings → Data Sources).",
      inputSchema: z
        .object({
          datasourceId: z
            .string()
            .min(1)
            .optional()
            .describe(
              "Fetch a single data source by id (includes full assignment query SQL)",
            ),
          project: z
            .string()
            .describe("Project ID (use get_projects to find IDs).")
            .optional(),
          ...paginationSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ datasourceId, project, limit, offset, mostRecent }) => {
      // Fetch single data source
      if (datasourceId) {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/data-sources/${encodeURIComponent(datasourceId)}`,
            {
              headers: buildHeaders(apiKey),
            },
          );

          await handleResNotOk(res);

          const data = (await res.json()) as GetDataSourceResponse;

          return {
            content: [{ type: "text", text: formatDataSourceDetail(data) }],
          };
        } catch (error) {
          throw new Error(
            formatApiError(error, `fetching data source '${datasourceId}'`, [
              "Check the data source id is correct.",
              "Use get_data_sources without a datasourceId to list all available data sources.",
            ]),
          );
        }
      }

      // Fetch multiple data sources
      try {
        const data = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/data-sources",
          limit,
          offset,
          mostRecent,
          project ? { projectId: project } : undefined,
        )) as ListDataSourcesResponse;

        return {
          content: [{ type: "text", text: formatDataSources(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching data sources", [
            "Check that your GB_API_KEY has permission to read data sources.",
          ]),
        );
      }
    },
  );
}
