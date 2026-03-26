# Changelog

All notable changes to this project will be documented in this file.

## [1.9.3] - 2026-03-26

### Added

- `refresh_experiment_results` now supports optional `dimension` and `phase` parameters for dimension-sliced result breakdowns (e.g., by UTM source or country)

## [1.9.2] - 2026-03-13

### Added

- Rule IDs now shown in `get_feature_flags` output — enables use of `reorder_feature_rules` and `remove_feature_rule` which require rule IDs

## [1.9.1] - 2026-03-13

### Added

- `update_experiment` now supports `trackingKey` — align the experiment's tracking key with its linked feature flag key for correct exposure attribution

## [1.9.0] - 2026-03-11

### Added

- `update_feature_flag` — Update properties of an existing feature flag
- `toggle_feature_flag` — Enable or disable a feature flag per-environment
- `add_feature_rule` — Add a targeting rule to a specific environment
- `reorder_feature_rules` — Set rule evaluation order for an environment
- `remove_feature_rule` — Remove a rule from an environment
- `update_experiment` — Update experiment properties
- `start_experiment` — Launch a draft experiment
- `stop_experiment` — Stop a running experiment, optionally declare a winner
- `archive_experiment` — Archive or unarchive an experiment
- `refresh_experiment_results` — Trigger fresh analysis snapshot
- `create_fact_metric` — Create a new fact metric
- `update_fact_metric` — Update an existing fact metric
- `list_fact_tables` — List available fact tables
- `list_fact_metrics` — List fact metrics with full configuration

## [1.8.1] - 2026-03-09

Re-publish of 1.8.0 to include `list_feature_keys` tool in npm package.

## [1.8.0] - 2026-03-09

### Added

- `list_feature_keys` tool — returns all feature flag IDs (keys only, no details) with no pagination limit, useful for large orgs before calling `get_stale_feature_flags`
- `customFields` parameter for `create_feature_flag` and `create_experiment` tools — pass custom field values as key-value pairs
- `CLAUDE.md` — codebase guide for AI agents with build commands, architecture, and contribution patterns

### Changed

- `get_stale_feature_flags` now references `list_feature_keys` for flag ID discovery instead of SDK-specific grep patterns
- Tool descriptions are now language-agnostic — removed JS-specific SDK method references (e.g. `isOn`, `getFeatureValue`)
- `get_feature_flags` description now mentions 100-item limit and references `list_feature_keys` for larger orgs

## [1.7.0] - 2026-03-06

### Added

- `get_stale_feature_flags` tool — checks whether feature flags are stale and returns cleanup guidance including replacement values and SDK search patterns
- Agent-friendly response formatting for all tools following Anthropic's "Writing tools for agents" guidance
- Rich detail views for feature flags (full rule details, prerequisites, schedules) and experiments (phases, metrics, linked features, result summaries)
- Metric resolution in experiment full mode — shows metric names, types, and inverse status
- Multi-block MCP responses for experiment full mode (curated summary + raw results)

### Changed

- Replaced raw JSON responses with curated, agent-optimized formatting across all tools
- Tiered response detail: list views are scannable summaries, detail views include full configuration

### Removed

- `get_stale_safe_rollouts` tool — superseded by `get_stale_feature_flags` which covers all stale flag scenarios

## [1.6.0] - 2026-02-26

### Added

- Custom HTTP headers support via `GB_HTTP_HEADER_*` environment variables (#32). Useful for multi-tenant deployments and proxy authentication (e.g. Cloudflare Access)

## [1.5.1] - 2026-02-03

### Changed

- Made URL environment variables slash (/) agnostic for better configuration flexibility
- Improved flag type generation tool
- Update deps

## [1.5.0] - 2026-01-21

### Added

- Unit tests for core functionality (#27)
- Support for Rust SDK code generation
- `valueType` parameter to experiment tools

### Changed

- Refined tool descriptions in manifest.json for clarity
- Improved instructions in index.ts
- Experiments and force feature rules now additively update flags
- Added `fetchWithPagination` utility for better API data handling
- Refactored tool registration to use `registerTool` method

### Fixed

- Logic for parsing defaultValues

## [1.4.2] - 2025-12-30

### Changed

- Updated server configuration and TypeScript settings (#24)
- Added GitHub MCP registry publish action
- Updated npm authentication workflow

### Fixed

- URL in workflow configuration

## [1.4.0] - 2025-12-24

### Added

- Rate limit protection for API calls
- Summary mode for experiments
- Wrapped prompt improvements

### Changed

- Refined experiment fetching logic (#23)
- Updated search functionality
- Improved prompts and tool behavior

### Fixed

- Potential bugs with JSON stringify and experiment fetching

## [1.3.0] - 2025-11-01

### Added

- Tools to update, toggle, and delete feature flags (#16)
- Project filtering support for tools
- Dev script for development workflow
- Analyze mode for tools

### Changed

- Tool annotations and hints updated
- Made tool behavior more consistent
- Reconfigured flag defaults
- Updated regex to match actual feature flag name conditions

### Documentation

- Fixed example command for MCP Inspector in CONTRIBUTING
- Updated build directory and command references

## [1.2.0] - 2025-09-19

### Added

- Metric tools for working with GrowthBook metrics (#15)
- `server.json` for publishing to GitHub's MCP repo (#14)

### Changed

- Refined resource fetching to accommodate most recent items
- Updated package.json version and formatting

## [1.1.0] - 2025-07-03

### Added

- `create_experiment` tool for creating experiments (#10)
- MCP server badge (#7)
- `get_defaults` tool
- New documentation stubs for features

### Changed

- Generate flags command now runs in background
- Refactored for consistency across tools
- Updated dependencies

## [1.0.0] - 2025-05-15

### Added

- Initial npm release (#2)
- Core feature flag management tools:
  - `get_feature` - Get a single feature flag
  - `search` - Search for feature flags
  - `create_force_rule` - Create force rules for features
  - `get_stale_safe_rollouts` - Get stale safe rollout rules (removed in 1.7.0, replaced by `get_stale_feature_flags`)
  - `generate_types` - Generate TypeScript types for feature flags
- Experiment tools:
  - `get_experiment` - Get experiment details
  - `create_experiment` - Create new experiments
- SDK and environment tools:
  - `get_environments` - List available environments
  - `get_sdk_connections` - Get SDK connection details
  - `create_sdk_connection` - Create new SDK connections
- Documentation generation for multiple frameworks
- Attribute management tools
- Safe rollout rule creation

### Documentation

- Added README with usage instructions
- Added CONTRIBUTING guide
- Added LICENSE (MIT)

## [0.1.0] - 2025-05-14

### Added

- Initial commit with basic MCP server structure
- GrowthBook API integration
- Basic tool implementations for feature flags
