import { z } from "zod";
import {
  ExtendedToolsInterface,
  handleResNotOk,
  fetchWithRateLimit,
  buildHeaders,
} from "../utils.js";
import {
  formatDimensionList,
  formatDimensionCreated,
  formatDimensionDeleted,
  formatApiError,
} from "../format-responses.js";

interface DimensionTools extends ExtendedToolsInterface {}

export function registerDimensionTools({
  server,
  baseApiUrl,
  apiKey,
  user,
}: DimensionTools) {
  /**
   * Tool: list_dimensions
   */
  server.registerTool(
    "list_dimensions",
    {
      title: "List Dimensions",
      description:
        "Lists dimensions available for experiment result breakdowns. Dimensions are SQL-based queries tied to a datasource that segment experiment results (e.g., by country, device type). Optionally filter by datasource ID.",
      inputSchema: z.object({
        datasourceId: z
          .string()
          .optional()
          .describe(
            "Filter by datasource ID. Find datasource IDs via get_defaults.",
          ),
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
    async ({ datasourceId, limit, offset }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        if (datasourceId) queryParams.append("datasourceId", datasourceId);

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/dimensions?${queryParams.toString()}`,
          { headers: buildHeaders(apiKey) },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatDimensionList(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching dimensions", [
            "Check that your GB_API_KEY has permission to read dimensions.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: create_dimension
   */
  server.registerTool(
    "create_dimension",
    {
      title: "Create Dimension",
      description:
        "Creates a dimension for segmenting experiment results. A dimension is a SQL query that returns user_id and value columns, used to break down experiment metrics (e.g., by country, device type, plan tier). Find a valid datasourceId from get_defaults (returns the default), or by inspecting existing dimensions via list_dimensions.",
      inputSchema: z.object({
        name: z.string().describe("Dimension name (e.g., 'Country')"),
        description: z.string().optional().describe("Description"),
        datasourceId: z.string().describe("Datasource ID"),
        identifierType: z
          .string()
          .describe(
            "Identifier type that maps to experiment users (e.g., 'user_id')",
          ),
        query: z
          .string()
          .describe(
            "SQL query returning two columns named to match identifierType (e.g., 'user_id') and 'value' (the dimension value).",
          ),
        owner: z
          .string()
          .optional()
          .describe("Owner email (defaults to current user)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      name,
      description,
      datasourceId,
      identifierType,
      query,
      owner: dimOwner,
    }) => {
      try {
        const payload: Record<string, any> = {
          name,
          datasourceId,
          identifierType,
          query,
        };
        if (description !== undefined) payload.description = description;
        payload.owner = dimOwner || user;

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/dimensions`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatDimensionCreated(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `creating dimension '${name}'`, [
            "Check that the datasource ID is valid.",
            "The SQL query must return user identifier and dimension value columns.",
          ]),
        );
      }
    },
  );

  /**
   * Tool: delete_dimension
   */
  server.registerTool(
    "delete_dimension",
    {
      title: "Delete Dimension",
      description:
        "Deletes a dimension. This is destructive — experiment analyses using this dimension will lose it.",
      inputSchema: z.object({
        dimensionId: z.string().describe("Dimension ID to delete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ dimensionId }) => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/dimensions/${dimensionId}`,
          {
            method: "DELETE",
            headers: buildHeaders(apiKey),
          },
        );

        await handleResNotOk(res);
        const data = await res.json();

        return {
          content: [{ type: "text", text: formatDimensionDeleted(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `deleting dimension '${dimensionId}'`, [
            "Check the dimension ID is correct.",
            "Use list_dimensions to see available dimensions.",
          ]),
        );
      }
    },
  );
}
