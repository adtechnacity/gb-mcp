# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- `update_experiment_targeting` now supports draft experiments — agents can configure targeting (condition, saved groups, prerequisites, namespace, coverage, traffic split) before a human launches the experiment via the GrowthBook UI. Previously only running experiments were accepted, blocking agent-driven setup of SEM-targeted drafts. On drafts the tool always seeds/patches a single phase (the `mode` argument is ignored — drafts cannot have multiple phases); stopped/archived experiments still rejected with pointers to `resume_experiment` / `archive_experiment`.
- `start_experiment` now preserves any pre-seeded phase configuration from drafts (condition, coverage, variation weights, saved groups, prerequisites, namespace, phase name), so the `update_experiment_targeting` → `start_experiment` workflow actually persists what the agent set up instead of silently overwriting it with defaults. Explicit `coverage`, `trafficSplit`, or `targetingCondition` args at launch still override the seeded values for those fields only. Fresh drafts with no seeded phase continue to launch with the previous defaults (coverage 1.0, equal split, condition `"{}"`).
- `start_experiment` now realigns seeded weights by `variationId` when the source phase carries `trafficSplit` entries with IDs (e.g. drafts seeded via the GrowthBook UI), so variation reorders/replacements between seed and launch no longer silently apply weights to the wrong variations. Falls back to equal split when any current variation isn't covered by the seeded IDs. For phases without IDs (only positional `variationWeights`), same-length reorders remain undetectable — length mismatch still triggers equal-split fallback, and length match still applies seeded weights positionally.
- Experiment detail rendering is now status-aware: drafts render phases as "not yet launched" instead of `<dateStarted> → ongoing`, so a seeded draft no longer reads as an active experiment. The seeded phase still carries `dateStarted` in the POST body (the GrowthBook API requires it), but the renderer keys off `experiment.status` rather than the presence of `dateStarted`.
- `update_experiment_targeting` now rejects archived experiments explicitly (the `archived` flag is independent of `status` — an archived draft would previously slip past the status guard). The archived check runs before any status-specific branching, so an archived-stopped experiment now gets pointed at `archive_experiment` (archived=false) instead of the stale `resume_experiment` suggestion.
- `update_experiment_targeting` now drops stale seeded `variationWeights` on draft patchCurrent when the variation count changed between targeting edits (e.g. variations added/removed via `update_experiment`) and falls back to equal split, mirroring the `start_experiment` fallback. Same-length reorderings still apply seeded weights positionally — variation IDs aren't stored on phases at seed time, so reorders can't be detected. Running-experiment paths are unchanged.
- `update_experiment_targeting` now rejects draft patchCurrent when the variations list was cleared between targeting edits, instead of posting stale weights for variations that no longer exist. Points the agent at `update_experiment` to set variations first.
- Draft patchCurrent confirmation message is now draft-aware: the response headline says "targeting configured (draft)" and explicitly reminds the agent that a human still needs to launch the experiment via the UI (or call `start_experiment`). Previously the message matched the running-experiment confirmation, so an agent could stop after "successfully" patching even though no users were enrolling.
- Draft seed/patch confirmation messages now flag the `includeDraftExperiments` SDK setting (uncommon, used for QA/preview) — when enabled, draft experiments enroll users immediately regardless of status, so agents seeding production-bound targeting should verify SDK config with the team before relying on the "still a draft" guarantee.

## [1.10.1] - 2026-05-09

### Added

- `create_experiment` now accepts a `key` field per variation. The key is the value GrowthBook's analysis pipeline matches against your assignment-query `variation_id` column — set this to whatever your application writes to analytics. Defaults to the array index ('0', '1', ...) when omitted, preserving existing behavior.
- `update_experiment` now accepts a `variations` array (full replacement). Use this to fix per-variation `key` or `name` after creation without opening the GrowthBook UI. Variation `value`s for a linked feature flag still live on the feature's experiment-ref rule and are not changed by this tool.

### Fixed

- `start_experiment` now sends `variationWeights` (the field GrowthBook's mapper reads) instead of the deprecated `trafficSplit`, and sends both `condition` and `targetingCondition` for the new phase. Previously, the launched phase's targeting was silently dropped on the server side and weights could be reset to equal split. Brings `start_experiment` to parity with `update_experiment_targeting`, `resume_experiment`, and `stop_experiment`.

### Why this matters

Experiments created via MCP with non-numeric analytics `variation_id`s (e.g. `coupon_a`, `treatment`) used to show "User Ids: 0" on the Results page indefinitely, because the auto-generated keys ("0", "1") never matched the warehouse rows. The only workaround was opening the GrowthBook UI after every MCP-created experiment and editing each variation's "Variation Key" by hand. With these changes, the agent can set keys at creation time and fix them in place after the fact.

## [1.10.0] - 2026-05-05

### Added

- `update_experiment_targeting` — change targeting on a running experiment without flipping its status. Defaults to appending a new phase so the previous data segment stays clean for analysis; supports targeting condition, saved groups, prerequisites, namespace, coverage, and traffic split
- `resume_experiment` — relaunch a stopped experiment back to running status by appending a new phase. Optionally apply targeting/coverage/trafficSplit overrides to the resumed phase.

### Changed

- `mostRecent` pagination now correctly returns newest-first across all pages (previously only page 0 was reversed). Callers using `mostRecent: true` with `offset > 0` will see different ordering — the new behavior matches the natural reading of the option.
- Tightened LLM-facing descriptions on ~15 tools to lead with prerequisites, cross-reference companion tools, and clarify when MongoDB-style conditions must be passed as JSON strings.
- `set_user_defaults` and `clear_user_defaults` no longer use `destructiveHint: true` (they only touch local config; restoring is trivial). Hosts will stop gating these behind destructive-action confirmation dialogs.

### Fixed

- `update_experiment_targeting` and `resume_experiment` no longer silently drop `targetingCondition` from the request body. The GrowthBook server's update mapper reads `condition` (not `targetingCondition`) on phase items; we now send both field names so the targeting actually persists. Verified against GrowthBook server source.
- All experiment phase mutations (`update_experiment_targeting`, `resume_experiment`, `stop_experiment`) now send `variationWeights` (the field GrowthBook's mapper reads) instead of the deprecated `trafficSplit`. Previously, weights were silently reset to equal split on every mutation.
- `stop_experiment` now correctly persists the stop reason. Previously sent `reasonForStopping` on the last phase, but the server reads `reason` — the value was silently dropped.
- `start_experiment` now always sends `targetingCondition` (defaulting to `"{}"`) so GrowthBook never falls back to a stale server-side default, and validates the value is JSON-parseable before sending.
- `namespace: null` on `update_experiment_targeting` and `resume_experiment` now actually clears the namespace on the new/patched phase instead of being silently sent to GrowthBook (which would 400 — Zod rejects null). Behavior: omits `namespace` from the new phase entirely.

## [1.9.3] - 2026-03-26

### Added

- `refresh_experiment_results` now supports optional `dimension` and `phase` parameters — break down results by dimension (e.g., UTM source, country) or filter to a specific experiment phase

### Improved

- `get_metrics` now fetches legacy and fact metrics in parallel for faster responses
- Custom HTTP headers (`GB_HTTP_HEADER_*`) are now cached after first computation
- Rate-limit retry delay is now capped at 60 seconds to prevent indefinite hangs

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
