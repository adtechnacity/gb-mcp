# GrowthBook MCP Server

With the GrowthBook MCP server, you can interact with GrowthBook right from your LLM client. Manage feature flags, run experiments, analyze results, and more.

<a href="https://glama.ai/mcp/servers/@growthbook/growthbook-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@growthbook/growthbook-mcp/badge" alt="GrowthBook Server MCP server" />
</a>

## Setup

### Environment Variables

| Variable           | Status   | Description                                                                                                                                                                                  |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GB_API_KEY`       | Required | A GrowthBook API key or PAT. When using a PAT, MCP server capabilities are limited by its permissions.                                                                                       |
| `GB_EMAIL`         | Required | Your email address used with GrowthBook. Used when creating feature flags and experiments.                                                                                                   |
| `GB_API_URL`       | Optional | Your GrowthBook API URL. Defaults to `https://api.growthbook.io`.                                                                                                                            |
| `GB_APP_ORIGIN`    | Optional | Your GrowthBook app URL. Defaults to `https://app.growthbook.io`.                                                                                                                            |
| `GB_HTTP_HEADER_*` | Optional | Custom HTTP headers for all API requests. Pattern: `GB_HTTP_HEADER_<NAME>=value` where underscores become hyphens. Example: `GB_HTTP_HEADER_X_TENANT_ID=abc123` sends `X-Tenant-ID: abc123`. |

Add the MCP server to your AI tool of choice. See the [official docs](https://docs.growthbook.io/integrations/mcp) for a complete guide.

## Tools

### Feature Flags

| Tool                      | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `create_feature_flag`     | Create a new feature flag (disabled in all environments by default)  |
| `get_feature_flags`       | List flags or fetch details for a specific flag by ID                |
| `list_feature_keys`       | Get all feature flag IDs (keys only), optionally filtered by project |
| `get_stale_feature_flags` | Check flag staleness and get cleanup guidance                        |
| `generate_flag_types`     | Generate TypeScript types for feature flags                          |
| `update_feature_flag`     | Update flag properties (description, defaultValue, tags, etc.)       |
| `toggle_feature_flag`     | Enable or disable a flag per environment                             |
| `create_force_rule`       | Add a targeting rule to a flag (all environments)                    |
| `add_feature_rule`        | Add a targeting rule to a specific environment                       |
| `reorder_feature_rules`   | Set rule evaluation order for an environment                         |
| `remove_feature_rule`     | Remove a rule from an environment                                    |

### Experiments

| Tool                          | Description                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `create_experiment`           | Create a new A/B test (call `get_defaults` first)                                                                 |
| `get_experiments`             | List experiments or fetch details (metadata, summary, or full modes)                                              |
| `update_experiment`           | Update experiment properties (name, hypothesis, trackingKey, metrics, etc.)                                       |
| `start_experiment`            | Launch a draft experiment with traffic allocation                                                                 |
| `update_experiment_targeting` | Change targeting on a running experiment without flipping status (defaults to a new phase to keep analysis clean) |
| `stop_experiment`             | Stop a running experiment, optionally declaring a winner                                                          |
| `archive_experiment`          | Archive or unarchive an experiment                                                                                |
| `refresh_experiment_results`  | Trigger a fresh analysis snapshot and return results (supports dimension and phase)                               |
| `get_attributes`              | List user attributes for targeting                                                                                |

### Metrics

| Tool                       | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `get_metrics`              | List all metrics (fact and legacy)                        |
| `create_fact_metric`       | Create a proportion, mean, quantile, or ratio fact metric |
| `update_fact_metric`       | Update an existing fact metric                            |
| `delete_fact_metric`       | Delete a fact metric                                      |
| `list_fact_tables`         | List available fact tables (SQL data sources)             |
| `create_fact_table`        | Create a new fact table                                   |
| `update_fact_table`        | Update an existing fact table                             |
| `delete_fact_table`        | Delete a fact table                                       |
| `list_fact_metrics`        | List fact metrics with configuration details              |
| `list_fact_table_filters`  | List filters for a fact table                             |
| `create_fact_table_filter` | Create a filter on a fact table                           |
| `delete_fact_table_filter` | Delete a fact table filter                                |

### Dimensions

| Tool               | Description                                         |
| ------------------ | --------------------------------------------------- |
| `list_dimensions`  | List dimensions available for experiment breakdowns |
| `create_dimension` | Create a new dimension for result segmentation      |
| `delete_dimension` | Delete a dimension                                  |

### Configuration & Search

| Tool                     | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `get_environments`       | List all environments (production, staging, etc.) |
| `get_projects`           | List all projects in your organization            |
| `get_sdk_connections`    | List SDK connections                              |
| `create_sdk_connection`  | Create a new SDK connection                       |
| `get_defaults`           | Get default config for creating experiments       |
| `set_user_defaults`      | Set custom experiment defaults                    |
| `clear_user_defaults`    | Reset to automatic defaults                       |
| `search_growthbook_docs` | Search official GrowthBook documentation          |

## Development

### Prerequisites

- Node.js (LTS)
- npm

### Setup

```bash
git clone https://github.com/growthbook/growthbook-mcp.git
cd growthbook-mcp
npm install
npm run build
```

### Commands

```bash
npm run build              # TypeScript compilation → server/
npm run dev                # Watch mode
npm test                   # Run all tests
npm run test:coverage      # Tests with coverage
npm run generate-api-types # Regenerate types from OpenAPI spec
```

### Architecture

```
src/
  index.ts              # Entry point, registers all tool groups
  utils.ts              # Shared utilities (fetch, headers, rate limiting)
  format-responses.ts   # Response formatters (agent-friendly markdown)
  api-types.d.ts        # Auto-generated from OpenAPI spec (DO NOT EDIT)
  api-type-helpers.ts   # Typed aliases for API responses
  tools/
    features.ts         # Feature flag tools
    experiments/
      experiments.ts    # Experiment lifecycle tools
    metrics.ts          # Metrics and fact table tools
    dimensions.ts       # Dimension tools
    defaults.ts         # Experiment defaults
    environments.ts     # Environment listing
    projects.ts         # Project listing
    sdk-connections.ts  # SDK connections
    search.ts           # Documentation search
  prompts/              # MCP prompt registrations
```

Each tool group exports a `register*Tools()` function called from `index.ts`. All tools use Zod schemas for input validation and return agent-friendly markdown via formatters in `format-responses.ts`.

### Contributing

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines including:

- How to add new tools (checklist)
- Tool annotation conventions
- Test patterns for write tools
- Files that must stay in sync

## License

MIT
