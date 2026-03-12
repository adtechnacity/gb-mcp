# GrowthBook MCP Write Tools Extension

**Date:** 2026-03-11
**Status:** Draft
**Scope:** Private fork — full write capabilities for AI agent workflows

## Problem

The GrowthBook MCP server currently has 16 tools focused on read operations and basic creation. AI agents cannot complete full workflows because they lack the ability to:

- Update feature flags or experiments after creation
- Toggle feature flags per-environment
- Add rules to specific environments (current `create_force_rule` applies to all defaults)
- Reorder or remove rules on feature flags
- Launch experiments (currently requires GrowthBook UI)
- Stop experiments and declare a winner
- Refresh experiment results on demand
- Create or update metrics programmatically

The GrowthBook REST API supports all of these operations. This design adds 14 new tools to close these gaps.

## Constraints

- **Soft deletes only** — archive/toggle-off operations, no permanent deletes
- **Scope: core + metrics** — features, experiments, and fact metrics. No saved groups, segments, dashboards, or teams.
- **Follow existing patterns** — `server.registerTool()` with Zod schemas, `format-responses.ts` formatters, `fetchWithRateLimit()`, `formatApiError()` for errors
- **Private fork** — can be more aggressive about what we add without upstream acceptance concerns

## Design

### Overview

14 new tools organized into 3 groups:

| Group         | New Tools                                                                                                        | Files                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Feature Flags | `update_feature_flag`, `toggle_feature_flag`, `add_feature_rule`, `reorder_feature_rules`, `remove_feature_rule` | `src/tools/features.ts`                |
| Experiments   | `update_experiment`, `start_experiment`, `stop_experiment`, `archive_experiment`, `refresh_experiment_results`   | `src/tools/experiments/experiments.ts` |
| Metrics       | `create_fact_metric`, `update_fact_metric`                                                                       | `src/tools/metrics.ts`                 |

Plus 2 supporting read tools:
| Group | New Tools | Files |
|-------|-----------|-------|
| Metrics | `list_fact_tables`, `list_fact_metrics` | `src/tools/metrics.ts` |

Total: 14 new tools (12 write + 2 read).

### Detailed Tool Specifications

---

#### Feature Flag Tools

##### `update_feature_flag`

Updates properties of an existing feature flag.

**API:** POST `/api/v1/features/{id}`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param          | Type     | Required | Description                              |
| -------------- | -------- | -------- | ---------------------------------------- |
| `featureId`    | string   | yes      | The feature flag key                     |
| `description`  | string   | no       | Updated description                      |
| `owner`        | string   | no       | Updated owner email                      |
| `project`      | string   | no       | Move to a different project              |
| `tags`         | string[] | no       | Replace tags array                       |
| `archived`     | boolean  | no       | Archive or unarchive the flag            |
| `defaultValue` | string   | no       | New default value (must match valueType) |

**Behavior:**

1. Fetch current flag state via `fetchFeatureFlag()`
2. Build payload with only the provided fields (omit undefined)
3. POST to `/api/v1/features/{id}`
4. Return formatted detail via `formatFeatureFlagDetail()` (no SDK snippet — the flag already exists and the user already has integration code)

**Error guidance:**

- "Check that the feature flag exists — use get_feature_flags to verify."
- "Ensure defaultValue matches the flag's valueType."

---

##### `toggle_feature_flag`

Enables or disables a feature flag in specific environments.

**API:** POST `/api/v1/features/{id}/toggle`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param          | Type                    | Required | Description                                                                                 |
| -------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `featureId`    | string                  | yes      | The feature flag key                                                                        |
| `environments` | Record<string, boolean> | yes      | Map of environment name to desired state. Example: `{"production": true, "staging": false}` |
| `reason`       | string                  | no       | Audit trail explanation for the toggle (optional per API, but recommended)                  |

**Behavior:**

1. POST to `/api/v1/features/{id}/toggle` with `{ reason, environments }`
2. Return confirmation with per-environment enabled/disabled status

**Error guidance:**

- "Check environment names with get_environments."
- "Verify the feature flag exists with get_feature_flags."

---

##### `add_feature_rule`

Adds a targeting rule to a specific environment on a feature flag. Unlike `create_force_rule` which applies to all default environments, this targets a single environment.

**API:** POST `/api/v1/features/{id}` (feature update)
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param           | Type                 | Required     | Description                                               |
| --------------- | -------------------- | ------------ | --------------------------------------------------------- |
| `featureId`     | string               | yes          | The feature flag key                                      |
| `environment`   | string               | yes          | Single environment ID (e.g., "production")                |
| `ruleType`      | "force" \| "rollout" | yes          | Type of rule to add                                       |
| `value`         | string               | yes          | Value to serve when rule matches (force) or rollout value |
| `condition`     | string               | no           | MongoDB-style targeting condition                         |
| `coverage`      | number               | no (rollout) | Traffic percentage 0-1 for rollout rules                  |
| `hashAttribute` | string               | no (rollout) | Attribute for bucketing rollout users (default: "id")     |
| `description`   | string               | no           | Rule description                                          |

**Behavior:**

1. Fetch current flag via `fetchFeatureFlag()`
2. Build rule object based on `ruleType`
3. Append rule to the specified environment's rules array only
4. POST the updated environments to `/api/v1/features/{id}`
5. Return formatted detail (updated feature summary)

**Description for AI agents:**
"Adds a targeting rule to a specific environment on a feature flag. Use get_environments to discover environment IDs. For rules across all environments, use create_force_rule instead."

---

##### `reorder_feature_rules`

Sets the evaluation order of rules for a specific environment on a feature flag.

**API:** POST `/api/v1/features/{id}` (feature update)
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param         | Type     | Required | Description                          |
| ------------- | -------- | -------- | ------------------------------------ |
| `featureId`   | string   | yes      | The feature flag key                 |
| `environment` | string   | yes      | Environment ID                       |
| `ruleIds`     | string[] | yes      | Rule IDs in desired evaluation order |

**Behavior:**

1. Fetch current flag
2. Validate all provided rule IDs exist in the environment
3. Reorder the rules array to match `ruleIds` order
4. POST updated environments
5. Return formatted detail showing the new rule order

**Error guidance:**

- "Use get_feature_flags with the featureFlagId to see current rules and their IDs."
- "All existing rule IDs for the environment must be included."

---

##### `remove_feature_rule`

Removes a specific rule from an environment on a feature flag.

**API:** POST `/api/v1/features/{id}` (feature update)
**Annotations:** `readOnlyHint: false`, `destructiveHint: true`

**Input Schema:**

| Param         | Type   | Required | Description                  |
| ------------- | ------ | -------- | ---------------------------- |
| `featureId`   | string | yes      | The feature flag key         |
| `environment` | string | yes      | Environment ID               |
| `ruleId`      | string | yes      | The ID of the rule to remove |

**Behavior:**

1. Fetch current flag
2. Filter out the rule with matching ID from the environment's rules
3. POST updated environments
4. Return formatted detail

---

#### Experiment Tools

##### `update_experiment`

Updates properties of an existing experiment.

**API:** POST `/api/v1/experiments/{id}`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param              | Type     | Required | Description          |
| ------------------ | -------- | -------- | -------------------- |
| `experimentId`     | string   | yes      | Experiment ID        |
| `name`             | string   | no       | Updated name         |
| `description`      | string   | no       | Updated description  |
| `hypothesis`       | string   | no       | Updated hypothesis   |
| `tags`             | string[] | no       | Replace tags         |
| `owner`            | string   | no       | Owner email          |
| `project`          | string   | no       | Move to project      |
| `metrics`          | string[] | no       | Goal metric IDs      |
| `guardrailMetrics` | string[] | no       | Guardrail metric IDs |
| `secondaryMetrics` | string[] | no       | Secondary metric IDs |
| `activationMetric` | string   | no       | Activation metric ID |

**Behavior:**

1. Build payload with only provided fields
2. POST to `/api/v1/experiments/{id}`
3. Return formatted experiment detail

**Intentionally excluded fields:** `status`, `archived`, `phases`, `releasedVariationId`, `excludeFromPayload`, `variations` — these are handled by the specialized lifecycle tools (`start_experiment`, `stop_experiment`, `archive_experiment`). Fields like `hashAttribute`, `statsEngine`, `regressionAdjustmentEnabled`, and `sequentialTestingEnabled` are omitted for simplicity but could be added later.

---

##### `start_experiment`

Launches a draft experiment into "running" status.

**API:** POST `/api/v1/experiments/{id}`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param                | Type                                         | Required | Description                                    |
| -------------------- | -------------------------------------------- | -------- | ---------------------------------------------- |
| `experimentId`       | string                                       | yes      | Experiment ID                                  |
| `coverage`           | number                                       | no       | Traffic percentage 0-1 (default: 1.0)          |
| `trafficSplit`       | Array<{variationId: string, weight: number}> | no       | Custom traffic split. Defaults to equal split. |
| `targetingCondition` | string                                       | no       | MongoDB-style targeting for experiment entry   |

**Behavior:**

1. Fetch experiment, validate status is "draft"
2. If status is not "draft", return error with guidance
3. Construct a new phase using the `trafficSplit` array format (not `variationWeights`):
   - `name`: "Phase 1"
   - `dateStarted`: current ISO timestamp
   - `coverage`: provided or 1.0
   - `trafficSplit`: provided, or computed as equal weights: `experiment.variations.map(v => ({ variationId: v.variationId, weight: 1 / variations.length }))`
   - `targetingCondition`: provided or empty
4. Set `status: "running"` and `phases: [newPhase]`
5. POST update
6. Return formatted experiment detail with link to GrowthBook

**Description for AI agents:**
"Launches a draft experiment. The experiment must be in 'draft' status. Use get_experiments to check status first. Use update_experiment to configure metrics before launching."

---

##### `stop_experiment`

Stops a running experiment, optionally declaring a winner.

**API:** POST `/api/v1/experiments/{id}`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param                 | Type    | Required | Description                                                                   |
| --------------------- | ------- | -------- | ----------------------------------------------------------------------------- |
| `experimentId`        | string  | yes      | Experiment ID                                                                 |
| `releasedVariationId` | string  | no       | Variation ID to declare as winner. Use get_experiments to find variation IDs. |
| `reason`              | string  | no       | Why the experiment was stopped                                                |
| `excludeFromPayload`  | boolean | no       | Remove from SDK payloads after stopping (default: false)                      |

**Behavior:**

1. Fetch experiment, validate status is "running"
2. Build update payload with `status: "stopped"`
3. If `releasedVariationId` provided, include it in payload
4. If `excludeFromPayload` provided, include it in payload
5. Copy the full existing `phases` array from the fetched experiment, modify only the last phase: set `dateEnded` to current ISO timestamp and `reasonForStopping` to the provided reason. Send the entire `phases` array in the payload (the API replaces the full array, not individual phases).
6. POST update
7. Return formatted experiment detail with winner info

**Description for AI agents:**
"Stops a running experiment. To declare a winner, provide the releasedVariationId — use get_experiments with the experimentId first to see available variation IDs and their names."

---

##### `archive_experiment`

Archives or unarchives an experiment (soft delete).

**API:** POST `/api/v1/experiments/{id}`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param          | Type    | Required | Description                                                |
| -------------- | ------- | -------- | ---------------------------------------------------------- |
| `experimentId` | string  | yes      | Experiment ID                                              |
| `archived`     | boolean | no       | Set to true to archive, false to unarchive (default: true) |

**Behavior:**

1. POST `{ archived }` to the experiment update endpoint
2. Return confirmation

---

##### `refresh_experiment_results`

Triggers a fresh analysis snapshot for an experiment and returns the results.

**API:** POST `/api/v1/experiments/{id}/snapshot`, GET `/api/v1/snapshots/{snapshotId}`
**Annotations:** `readOnlyHint: false`, `idempotentHint: true`

**Input Schema:**

| Param          | Type   | Required | Description   |
| -------------- | ------ | -------- | ------------- |
| `experimentId` | string | yes      | Experiment ID |

**Behavior:**

1. POST to `/api/v1/experiments/{id}/snapshot` with `{ triggeredBy: "manual" }`
2. Get the snapshot ID from the response
3. Poll GET `/api/v1/snapshots/{snapshotId}` with exponential backoff (1s, 2s, 4s, 8s, 16s) until snapshot status indicates completion (check for `status !== "running"` rather than specific values, since the API schema does not enumerate status values), or timeout after 31s
4. If successful, fetch and return fresh experiment results via `/experiments/{id}/results`
5. If still running after timeout, return the snapshot ID and tell the agent to check back later

---

#### Metrics Tools

##### `create_fact_metric`

Creates a new fact metric.

**API:** POST `/api/v1/fact-metrics`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

| Param         | Type                                                                                   | Required | Description                        |
| ------------- | -------------------------------------------------------------------------------------- | -------- | ---------------------------------- |
| `name`        | string                                                                                 | yes      | Metric name                        |
| `description` | string                                                                                 | no       | Description                        |
| `metricType`  | "proportion" \| "mean" \| "quantile" \| "ratio" \| "retention" \| "dailyParticipation" | yes      | Type of metric                     |
| `numerator`   | object                                                                                 | yes      | `{ factTableId, column, filters }` |
| `denominator` | object                                                                                 | no       | Required for ratio metrics         |
| `tags`        | string[]                                                                               | no       | Tags                               |
| `projects`    | string[]                                                                               | no       | Project IDs                        |
| `owner`       | string                                                                                 | no       | Owner (defaults to current user)   |

**Behavior:**

1. Build fact metric payload
2. POST to `/api/v1/fact-metrics`
3. Return formatted metric detail

---

##### `update_fact_metric`

Updates an existing fact metric.

**API:** POST `/api/v1/fact-metrics/{id}`
**Annotations:** `readOnlyHint: false`, `destructiveHint: false`

**Input Schema:**

Same optional fields as `create_fact_metric` plus:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `metricId` | string | yes | Fact metric ID |

---

##### `list_fact_tables`

Lists available fact tables. Needed so agents can discover fact table IDs when creating metrics.

**API:** GET `/api/v1/fact-tables`
**Annotations:** `readOnlyHint: true`

**Input Schema:**

| Param    | Type   | Required | Description                                   |
| -------- | ------ | -------- | --------------------------------------------- |
| `limit`  | number | no       | Number of items to fetch (1-100, default 100) |
| `offset` | number | no       | Number of items to skip (default 0)           |

**Behavior:**

1. GET `/api/v1/fact-tables` with pagination params
2. Return formatted list of fact tables with IDs, names, SQL, and associated data source

---

##### `list_fact_metrics`

Lists fact metrics. Complements the existing `get_metrics` tool which returns both legacy and fact metrics — this returns only fact metrics with their full configuration.

**API:** GET `/api/v1/fact-metrics`
**Annotations:** `readOnlyHint: true`

**Input Schema:**

| Param       | Type   | Required | Description                                   |
| ----------- | ------ | -------- | --------------------------------------------- |
| `limit`     | number | no       | Number of items to fetch (1-100, default 100) |
| `offset`    | number | no       | Number of items to skip (default 0)           |
| `projectId` | string | no       | Filter by project ID                          |

**Behavior:**

1. GET `/api/v1/fact-metrics` with pagination and optional project filter
2. Return formatted list of fact metrics with IDs, names, types, and associated fact tables

---

### Implementation Structure

#### New Type Helpers (`src/api-type-helpers.ts`)

Already existing types to reuse (no changes needed):

- `ToggleFeatureResponse` (line 49)
- `UpdateFeatureResponse` (line 45)
- `GetExperimentResultsResponse` (line 71)

New types to add:

```typescript
// Experiment update (POST, distinct from GET response)
export type UpdateExperimentResponse =
  Paths["/experiments/{id}"]["post"]["responses"][200]["content"]["application/json"];

// Snapshots
export type CreateSnapshotResponse =
  Paths["/experiments/{id}/snapshot"]["post"]["responses"][200]["content"]["application/json"];
export type GetSnapshotResponse =
  Paths["/snapshots/{id}"]["get"]["responses"][200]["content"]["application/json"];

// Fact metrics (write)
export type CreateFactMetricResponse =
  Paths["/fact-metrics"]["post"]["responses"][200]["content"]["application/json"];
export type UpdateFactMetricResponse =
  Paths["/fact-metrics/{id}"]["post"]["responses"][200]["content"]["application/json"];

// Fact tables (read-only)
export type ListFactTablesResponse =
  Paths["/fact-tables"]["get"]["responses"][200]["content"]["application/json"];
```

#### New Formatters (`src/format-responses.ts`)

New formatter functions needed:

| Formatter                       | Used by                      |
| ------------------------------- | ---------------------------- |
| `formatFeatureFlagUpdated()`    | `update_feature_flag`        |
| `formatFeatureFlagToggled()`    | `toggle_feature_flag`        |
| `formatFeatureRuleAdded()`      | `add_feature_rule`           |
| `formatFeatureRulesReordered()` | `reorder_feature_rules`      |
| `formatFeatureRuleRemoved()`    | `remove_feature_rule`        |
| `formatExperimentUpdated()`     | `update_experiment`          |
| `formatExperimentStarted()`     | `start_experiment`           |
| `formatExperimentStopped()`     | `stop_experiment`            |
| `formatExperimentArchived()`    | `archive_experiment`         |
| `formatSnapshotResult()`        | `refresh_experiment_results` |
| `formatFactMetricCreated()`     | `create_fact_metric`         |
| `formatFactMetricUpdated()`     | `update_fact_metric`         |
| `formatFactTableList()`         | `list_fact_tables`           |
| `formatFactMetricList()`        | `list_fact_metrics`          |

Each formatter follows the existing pattern: returns markdown-formatted strings with agent-friendly output. List views are scannable summaries; detail views include full configuration.

**Reuse strategy:** Many of these formatters can be thin wrappers around existing formatters. For example, `formatFeatureFlagUpdated()` can prepend a success message then call `formatFeatureFlagDetail()`. Similarly, `formatExperimentStarted()` and `formatExperimentStopped()` can wrap `formatExperimentDetail()` with status-specific headers. Only `formatFeatureFlagToggled()`, `formatSnapshotResult()`, `formatFactTableList()`, and `formatFactMetricList()` need entirely new formatting logic.

#### Files Modified

| File                                   | Changes                                         |
| -------------------------------------- | ----------------------------------------------- |
| `src/tools/features.ts`                | Add 5 new tool registrations                    |
| `src/tools/experiments/experiments.ts` | Add 5 new tool registrations                    |
| `src/tools/metrics.ts`                 | Add 4 new tool registrations (2 write + 2 read) |
| `src/format-responses.ts`              | Add 14 new formatter functions                  |
| `src/api-type-helpers.ts`              | Add ~7 new type aliases                         |
| `src/utils.ts`                         | No changes needed (existing helpers suffice)    |
| `manifest.json`                        | Add 14 new tool entries                         |
| `src/index.ts`                         | No changes (metrics tools already registered)   |

#### MCP Tool Annotations

All new write tools get:

```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: false, // soft operations only
}
```

The `refresh_experiment_results` tool additionally gets:

```typescript
annotations: {
  readOnlyHint: false,
  idempotentHint: true, // safe to retry
}
```

### Implementation Order

The tools should be implemented in this order due to dependencies:

1. **Phase 1: Feature Flag Write Tools** — `update_feature_flag`, `toggle_feature_flag`, `add_feature_rule`, `reorder_feature_rules`, `remove_feature_rule`
2. **Phase 2: Experiment Lifecycle Tools** — `update_experiment`, `start_experiment`, `stop_experiment`, `archive_experiment`, `refresh_experiment_results`
3. **Phase 3: Metrics Tools** — `create_fact_metric`, `update_fact_metric`, `list_fact_tables`, `list_fact_metrics`

Each phase is independently useful and can be shipped separately.

### Testing Strategy

- Unit tests for new formatter functions (pure functions, easy to test)
- Unit tests for tool registration (verify annotations, schema validation)
- Integration patterns match existing tests in `test/tools/`
- Manual verification against a live GrowthBook instance for each phase

### Backward Compatibility

- Existing `create_force_rule` is unchanged — it continues to work for all-environment rules
- Its description gets updated to mention `add_feature_rule` as an alternative for per-environment control
- No existing tool behavior changes
- All new tools are additive
