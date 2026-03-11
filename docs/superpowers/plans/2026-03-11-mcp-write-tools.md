# MCP Write Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 14 new tools to the GrowthBook MCP server enabling full write capabilities for feature flags, experiments, and metrics.

**Architecture:** Each tool follows the existing pattern: Zod input schema, `fetchWithRateLimit()` API call, markdown response via a dedicated formatter in `format-responses.ts`. Tools are registered in existing files (`features.ts`, `experiments.ts`, `metrics.ts`) and added to `manifest.json`.

**Tech Stack:** TypeScript, Zod, MCP SDK (`@modelcontextprotocol/sdk`), Vitest

**Spec:** `docs/superpowers/specs/2026-03-11-mcp-write-tools-design.md`

---

## File Structure

| File                                         | Responsibility                         | Action                        |
| -------------------------------------------- | -------------------------------------- | ----------------------------- |
| `src/api-type-helpers.ts`                    | Type aliases for API responses         | Modify: add 6 new types       |
| `src/format-responses.ts`                    | Markdown formatters for tool responses | Modify: add 14 new formatters |
| `src/tools/features.ts`                      | Feature flag tool registrations        | Modify: add 5 tools           |
| `src/tools/experiments/experiments.ts`       | Experiment tool registrations          | Modify: add 5 tools           |
| `src/tools/metrics.ts`                       | Metrics tool registrations             | Modify: add 4 tools           |
| `manifest.json`                              | MCP tool registry                      | Modify: add 14 entries        |
| `test/tools/write-tools-features.test.ts`    | Tests for feature write tools          | Create                        |
| `test/tools/write-tools-experiments.test.ts` | Tests for experiment write tools       | Create                        |
| `test/tools/write-tools-metrics.test.ts`     | Tests for metrics write tools          | Create                        |
| `test/format-responses-write.test.ts`        | Tests for new formatters               | Create                        |

---

## Chunk 1: Foundation — Type Helpers & Formatters

### Task 1: Add API Type Helpers

**Files:**

- Modify: `src/api-type-helpers.ts`

- [ ] **Step 1: Add new type aliases**

Append after the existing `Feature` type alias at line 92:

```typescript
// ─── Experiment mutations ───────────────────────────────────────────
export type UpdateExperimentResponse =
  Paths["/experiments/{id}"]["post"]["responses"][200]["content"]["application/json"];

// ─── Snapshots ──────────────────────────────────────────────────────
export type CreateSnapshotResponse =
  Paths["/experiments/{id}/snapshot"]["post"]["responses"][200]["content"]["application/json"];
export type GetSnapshotResponse =
  Paths["/snapshots/{id}"]["get"]["responses"][200]["content"]["application/json"];

// ─── Fact metrics (write) ───────────────────────────────────────────
export type CreateFactMetricResponse =
  Paths["/fact-metrics"]["post"]["responses"][200]["content"]["application/json"];
export type UpdateFactMetricResponse =
  Paths["/fact-metrics/{id}"]["post"]["responses"][200]["content"]["application/json"];

// ─── Fact tables ────────────────────────────────────────────────────
export type ListFactTablesResponse =
  Paths["/fact-tables"]["get"]["responses"][200]["content"]["application/json"];
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api-type-helpers.ts
git commit -m "feat: add API type helpers for write tools"
```

---

### Task 2: Add Feature Flag Write Formatters

**Files:**

- Modify: `src/format-responses.ts`
- Create: `test/format-responses-write.test.ts`

- [ ] **Step 1: Write failing tests for feature flag formatters**

Create `test/format-responses-write.test.ts`.

**Important:** Tasks 2, 3, and 4 each add imports and test blocks to this file. When implementing, consolidate all imports into a single import statement at the top of the file (not three separate imports from the same module). The code below shows each task's additions separately for clarity.

```typescript
import { describe, expect, it } from "vitest";
import {
  formatFeatureFlagUpdated,
  formatFeatureFlagToggled,
  formatFeatureRuleAdded,
  formatFeatureRulesReordered,
  formatFeatureRuleRemoved,
} from "../src/format-responses.js";

describe("feature flag write formatters", () => {
  const mockFeatureResponse = {
    feature: {
      id: "test-flag",
      valueType: "boolean",
      defaultValue: "false",
      description: "A test flag",
      owner: "test@example.com",
      archived: false,
      tags: ["mcp"],
      environments: {
        production: { enabled: true, rules: [] },
        staging: { enabled: false, rules: [] },
      },
    },
  };
  const appOrigin = "https://app.growthbook.io";

  it("formatFeatureFlagUpdated includes success message and flag detail", () => {
    const result = formatFeatureFlagUpdated(mockFeatureResponse, appOrigin);
    expect(result).toContain("updated");
    expect(result).toContain("test-flag");
    expect(result).toContain("View in GrowthBook");
  });

  it("formatFeatureFlagToggled shows per-environment status", () => {
    const result = formatFeatureFlagToggled("test-flag", {
      production: true,
      staging: false,
    });
    expect(result).toContain("test-flag");
    expect(result).toContain("production");
    expect(result).toContain("staging");
  });

  it("formatFeatureRuleAdded includes environment and rule type", () => {
    const result = formatFeatureRuleAdded(
      mockFeatureResponse,
      appOrigin,
      "production",
      "force",
    );
    expect(result).toContain("rule added");
    expect(result).toContain("production");
    expect(result).toContain("test-flag");
  });

  it("formatFeatureRulesReordered confirms reorder", () => {
    const result = formatFeatureRulesReordered(
      mockFeatureResponse,
      appOrigin,
      "production",
      ["rule-1", "rule-2"],
    );
    expect(result).toContain("reordered");
    expect(result).toContain("production");
  });

  it("formatFeatureRuleRemoved confirms removal", () => {
    const result = formatFeatureRuleRemoved(
      mockFeatureResponse,
      appOrigin,
      "production",
      "rule-1",
    );
    expect(result).toContain("removed");
    expect(result).toContain("production");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/format-responses-write.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement feature flag formatters**

Add to `src/format-responses.ts` after the `formatForceRuleCreated` function (around line 291):

```typescript
// ─── Feature Flag Write Formatters ──────────────────────────────────

export function formatFeatureFlagUpdated(
  data: UpdateFeatureResponse,
  appOrigin: string,
): string {
  return [
    `**Feature flag \`${data.feature?.id}\` updated.**`,
    "",
    formatFeatureFlagDetail(data as any, appOrigin),
  ].join("\n");
}

export function formatFeatureFlagToggled(
  featureId: string,
  environments: Record<string, boolean>,
): string {
  const envLines = Object.entries(environments).map(
    ([env, enabled]) => `- **${env}**: ${enabled ? "ON" : "OFF"}`,
  );
  return [`**Feature flag \`${featureId}\` toggled.**`, "", ...envLines].join(
    "\n",
  );
}

export function formatFeatureRuleAdded(
  data: GetFeatureResponse | UpdateFeatureResponse,
  appOrigin: string,
  environment: string,
  ruleType: string,
): string {
  const featureId = "feature" in data ? data.feature?.id : "unknown";
  const link = generateLinkToGrowthBook(
    appOrigin,
    "features",
    featureId || "unknown",
  );
  return [
    `**${ruleType} rule added to \`${featureId}\` in ${environment}.**`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFeatureRulesReordered(
  data: GetFeatureResponse | UpdateFeatureResponse,
  appOrigin: string,
  environment: string,
  ruleIds: string[],
): string {
  const featureId = "feature" in data ? data.feature?.id : "unknown";
  const link = generateLinkToGrowthBook(
    appOrigin,
    "features",
    featureId || "unknown",
  );
  return [
    `**Rules reordered for \`${featureId}\` in ${environment}.**`,
    "",
    `New order: ${ruleIds.map((id, i) => `${i + 1}. \`${id}\``).join(", ")}`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFeatureRuleRemoved(
  data: GetFeatureResponse | UpdateFeatureResponse,
  appOrigin: string,
  environment: string,
  ruleId: string,
): string {
  const featureId = "feature" in data ? data.feature?.id : "unknown";
  const link = generateLinkToGrowthBook(
    appOrigin,
    "features",
    featureId || "unknown",
  );
  return [
    `**Rule \`${ruleId}\` removed from \`${featureId}\` in ${environment}.**`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}
```

Also add the `UpdateFeatureResponse` import at the top of `format-responses.ts` if not already present (it is already imported on line 11). When implementing Task 3, also add `UpdateExperimentResponse` to the imports from `./api-type-helpers.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/format-responses-write.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format-responses.ts test/format-responses-write.test.ts
git commit -m "feat: add feature flag write formatters with tests"
```

---

### Task 3: Add Experiment Write Formatters

**Files:**

- Modify: `src/format-responses.ts`
- Modify: `test/format-responses-write.test.ts`

- [ ] **Step 1: Write failing tests for experiment formatters**

Append to `test/format-responses-write.test.ts`:

```typescript
import {
  formatExperimentUpdated,
  formatExperimentStarted,
  formatExperimentStopped,
  formatExperimentArchived,
  formatSnapshotResult,
} from "../src/format-responses.js";

describe("experiment write formatters", () => {
  const appOrigin = "https://app.growthbook.io";
  const mockExperiment = {
    experiment: {
      id: "exp_123",
      name: "Test Experiment",
      status: "running",
      type: "standard",
      variations: [
        { variationId: "v0", key: "0", name: "Control" },
        { variationId: "v1", key: "1", name: "Treatment" },
      ],
      phases: [],
      settings: { goals: [], guardrails: [], secondaryMetrics: [] },
    },
  };

  it("formatExperimentUpdated includes success message", () => {
    const result = formatExperimentUpdated(mockExperiment, appOrigin);
    expect(result).toContain("updated");
    expect(result).toContain("Test Experiment");
  });

  it("formatExperimentStarted includes running status", () => {
    const result = formatExperimentStarted(mockExperiment, appOrigin);
    expect(result).toContain("started");
    expect(result).toContain("exp_123");
  });

  it("formatExperimentStopped includes winner info when provided", () => {
    const result = formatExperimentStopped(
      mockExperiment,
      appOrigin,
      "v1",
      "Treatment won with +15% conversion",
    );
    expect(result).toContain("stopped");
    expect(result).toContain("v1");
  });

  it("formatExperimentStopped works without winner", () => {
    const result = formatExperimentStopped(mockExperiment, appOrigin);
    expect(result).toContain("stopped");
    expect(result).not.toContain("Winner");
  });

  it("formatExperimentArchived shows archive status", () => {
    const result = formatExperimentArchived("exp_123", true);
    expect(result).toContain("archived");
  });

  it("formatExperimentArchived shows unarchive status", () => {
    const result = formatExperimentArchived("exp_123", false);
    expect(result).toContain("unarchived");
  });

  it("formatSnapshotResult includes experiment results", () => {
    const result = formatSnapshotResult("exp_123", "success", appOrigin);
    expect(result).toContain("exp_123");
    expect(result).toContain("refreshed");
  });

  it("formatSnapshotResult handles timeout", () => {
    const result = formatSnapshotResult(
      "exp_123",
      "timeout",
      appOrigin,
      "snap_456",
    );
    expect(result).toContain("timeout");
    expect(result).toContain("snap_456");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/format-responses-write.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement experiment formatters**

Add to `src/format-responses.ts` after the `formatExperimentCreated` function (around line 442):

```typescript
// ─── Experiment Write Formatters ────────────────────────────────────
// Note: These formatters accept UpdateExperimentResponse (from POST /experiments/{id})
// which differs from GetExperimentResponse (GET). We cast to `any` when delegating
// to formatExperimentDetail since the shared fields (id, name, variations, etc.) overlap.

export function formatExperimentUpdated(
  data: UpdateExperimentResponse,
  appOrigin: string,
): string {
  return [
    `**Experiment updated.**`,
    "",
    formatExperimentDetail(data as any, appOrigin),
  ].join("\n");
}

export function formatExperimentStarted(
  data: UpdateExperimentResponse,
  appOrigin: string,
): string {
  const e = data.experiment;
  return [
    `**Experiment \`${e?.id}\` started.**`,
    `Status is now **running**.`,
    "",
    formatExperimentDetail(data as any, appOrigin),
  ].join("\n");
}

export function formatExperimentStopped(
  data: UpdateExperimentResponse,
  appOrigin: string,
  releasedVariationId?: string,
  reason?: string,
): string {
  const e = data.experiment;
  const parts = [`**Experiment \`${e?.id}\` stopped.**`];
  if (releasedVariationId) {
    const winnerName = e?.variations?.find(
      (v: any) => v.variationId === releasedVariationId,
    )?.name;
    parts.push(
      `Winner: **${winnerName || releasedVariationId}** (\`${releasedVariationId}\`)`,
    );
  }
  if (reason) parts.push(`Reason: ${reason}`);
  parts.push("");
  parts.push(formatExperimentDetail(data as any, appOrigin));
  return parts.join("\n");
}

export function formatExperimentArchived(
  experimentId: string,
  archived: boolean,
): string {
  return `**Experiment \`${experimentId}\` ${archived ? "archived" : "unarchived"}.**`;
}

export function formatSnapshotResult(
  experimentId: string,
  status: "success" | "timeout" | "error",
  appOrigin: string,
  snapshotId?: string,
): string {
  const link = generateLinkToGrowthBook(appOrigin, "experiment", experimentId);
  if (status === "success") {
    return [
      `**Experiment \`${experimentId}\` results refreshed.**`,
      "",
      `[View in GrowthBook](${link})`,
    ].join("\n");
  }
  if (status === "timeout") {
    return [
      `**Snapshot for \`${experimentId}\` is still processing (timeout).**`,
      snapshotId ? `Snapshot ID: \`${snapshotId}\` — check back later.` : "",
      "",
      `[View in GrowthBook](${link})`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return `**Error refreshing results for \`${experimentId}\`.** [View in GrowthBook](${link})`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/format-responses-write.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format-responses.ts test/format-responses-write.test.ts
git commit -m "feat: add experiment write formatters with tests"
```

---

### Task 4: Add Metrics Formatters

**Files:**

- Modify: `src/format-responses.ts`
- Modify: `test/format-responses-write.test.ts`

- [ ] **Step 1: Write failing tests for metrics formatters**

Append to `test/format-responses-write.test.ts`:

```typescript
import {
  formatFactMetricCreated,
  formatFactMetricUpdated,
  formatFactTableList,
  formatFactMetricList,
} from "../src/format-responses.js";

describe("metrics write formatters", () => {
  const appOrigin = "https://app.growthbook.io";

  it("formatFactMetricCreated shows metric name and id", () => {
    const result = formatFactMetricCreated(
      {
        factMetric: {
          id: "fact__m1",
          name: "Conversion Rate",
          metricType: "proportion",
        },
      },
      appOrigin,
    );
    expect(result).toContain("created");
    expect(result).toContain("Conversion Rate");
    expect(result).toContain("fact__m1");
  });

  it("formatFactMetricUpdated shows metric name and id", () => {
    const result = formatFactMetricUpdated(
      {
        factMetric: {
          id: "fact__m1",
          name: "Updated Name",
          metricType: "mean",
        },
      },
      appOrigin,
    );
    expect(result).toContain("updated");
    expect(result).toContain("fact__m1");
  });

  it("formatFactTableList shows tables with ids", () => {
    const result = formatFactTableList({
      factTables: [
        {
          id: "ft_1",
          name: "Events",
          sql: "SELECT * FROM events",
          datasource: "ds_1",
        },
        {
          id: "ft_2",
          name: "Orders",
          sql: "SELECT * FROM orders",
          datasource: "ds_1",
        },
      ],
    });
    expect(result).toContain("2");
    expect(result).toContain("Events");
    expect(result).toContain("ft_1");
  });

  it("formatFactTableList handles empty list", () => {
    const result = formatFactTableList({ factTables: [] });
    expect(result).toContain("No fact tables");
  });

  it("formatFactMetricList shows metrics with types", () => {
    const result = formatFactMetricList({
      factMetrics: [
        { id: "fact__m1", name: "Conv Rate", metricType: "proportion" },
        { id: "fact__m2", name: "Revenue", metricType: "mean" },
      ],
    });
    expect(result).toContain("2");
    expect(result).toContain("Conv Rate");
    expect(result).toContain("proportion");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/format-responses-write.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement metrics formatters**

Add to `src/format-responses.ts` after the `formatMetricDetail` function (around line 516):

```typescript
// ─── Fact Metric Write Formatters ───────────────────────────────────
// Note: Also add CreateFactMetricResponse, UpdateFactMetricResponse,
// and ListFactTablesResponse to the imports from ./api-type-helpers.js

export function formatFactMetricCreated(
  data: CreateFactMetricResponse,
  appOrigin: string,
): string {
  const m = data.factMetric;
  const link = generateLinkToGrowthBook(appOrigin, "fact-metrics", m?.id || "");
  return [
    `**Fact metric \`${m?.name}\` created.** (id: \`${m?.id}\`, type: ${m?.metricType})`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFactMetricUpdated(
  data: UpdateFactMetricResponse,
  appOrigin: string,
): string {
  const m = data.factMetric;
  const link = generateLinkToGrowthBook(appOrigin, "fact-metrics", m?.id || "");
  return [
    `**Fact metric \`${m?.id}\` updated.** (${m?.name}, type: ${m?.metricType})`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFactTableList(data: ListFactTablesResponse): string {
  const tables = (data as any).factTables || [];
  if (tables.length === 0) {
    return "No fact tables found. Fact tables must be created in GrowthBook before fact metrics can reference them.";
  }
  const lines = tables.map((t: any) => {
    const desc = t.description ? ` — ${t.description}` : "";
    return `- **${t.name}** (id: \`${t.id}\`)${desc}\n  Datasource: \`${t.datasource}\``;
  });
  return [`**${tables.length} fact table(s):**`, "", ...lines].join("\n");
}

export function formatFactMetricList(data: ListFactMetricsResponse): string {
  const metrics = (data as any).factMetrics || [];
  if (metrics.length === 0) {
    return "No fact metrics found. Use create_fact_metric to create one.";
  }
  const lines = metrics.map((m: any) => {
    const desc = m.description ? ` — ${m.description}` : "";
    return `- **${m.name}** (id: \`${m.id}\`, type: ${m.metricType})${desc}`;
  });
  return [`**${metrics.length} fact metric(s):**`, "", ...lines].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/format-responses-write.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing + new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/format-responses.ts test/format-responses-write.test.ts
git commit -m "feat: add metrics formatters with tests"
```

---

## Chunk 2: Phase 1 — Feature Flag Write Tools

### Task 5: `update_feature_flag` Tool

**Files:**

- Modify: `src/tools/features.ts`
- Create: `test/tools/write-tools-features.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/tools/write-tools-features.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type RegisteredTool = {
  name: string;
  config: any;
  handler: (args: any, extra?: any) => Promise<any>;
};

function makeServerCapture() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      config: any,
      handler: (args: any, extra?: any) => Promise<any>,
    ) => {
      tools.push({ name, config, handler });
    },
    server: {
      notification: vi.fn(async () => {}),
    },
  };
  return { server: server as any, tools };
}

function makeResponse(opts: { ok: boolean; status: number; json: any }) {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: "",
    headers: new Headers(),
    json: async () => opts.json,
    text: async () => JSON.stringify(opts.json),
  } as any as Response;
}

const baseArgs = {
  server: null as any,
  baseApiUrl: "https://api.example.com",
  apiKey: "key",
  appOrigin: "https://app.example.com",
  user: "u@example.com",
};

describe("update_feature_flag", () => {
  it("is registered with readOnlyHint: false", async () => {
    const { server, tools } = makeServerCapture();
    baseArgs.server = server;

    // Mock getDefaults to prevent file system access
    vi.doMock("../../src/tools/defaults.js", () => ({
      getDefaults: vi.fn(async () => ({
        environments: ["production"],
        datasource: "ds_1",
        assignmentQuery: "aq_1",
      })),
    }));

    const { registerFeatureTools } =
      await import("../../src/tools/features.js");
    registerFeatureTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_feature_flag");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(false);
  });

  it("sends only provided fields to the API", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      // First call: fetchFeatureFlag (GET)
      if (!init?.method || init.method === "GET") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            feature: {
              id: "my-flag",
              valueType: "boolean",
              defaultValue: "false",
              environments: { production: { enabled: true, rules: [] } },
            },
          },
        });
      }
      // Second call: update (POST)
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          feature: {
            id: "my-flag",
            valueType: "boolean",
            defaultValue: "true",
            description: "Updated",
            environments: { production: { enabled: true, rules: [] } },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerFeatureTools } =
      await import("../../src/tools/features.js");
    registerFeatureTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_feature_flag");
    const p = tool!.handler({
      featureId: "my-flag",
      description: "Updated",
      defaultValue: "true",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text).toContain("updated");

    // Verify POST was called with only the changed fields
    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);
    expect(body.description).toBe("Updated");
    expect(body.defaultValue).toBe("true");
    // Should NOT contain unchanged fields
    expect(body.valueType).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: FAIL — `update_feature_flag` not registered.

- [ ] **Step 3: Implement `update_feature_flag`**

Add to `src/tools/features.ts` after the `generate_flag_types` tool registration (around line 491), inside the `registerFeatureTools` function:

```typescript
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
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
```

Add the import for `formatFeatureFlagUpdated` at the top of `features.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/features.ts test/tools/write-tools-features.test.ts
git commit -m "feat: add update_feature_flag tool with test"
```

---

### Task 6: `toggle_feature_flag` Tool

**Files:**

- Modify: `src/tools/features.ts`
- Modify: `test/tools/write-tools-features.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/tools/write-tools-features.test.ts`:

```typescript
describe("toggle_feature_flag", () => {
  it("sends toggle request with environments and reason", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: { message: "Feature toggled successfully." },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerFeatureTools } =
      await import("../../src/tools/features.js");
    registerFeatureTools(baseArgs);

    const tool = tools.find((t) => t.name === "toggle_feature_flag");
    expect(tool).toBeTruthy();

    const p = tool!.handler({
      featureId: "my-flag",
      environments: { production: true, staging: false },
      reason: "Enabling for prod launch",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("toggled");
    const postCall = calls.find((c) => c.url.includes("/toggle"));
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);
    expect(body.environments.production).toBe(true);
    expect(body.environments.staging).toBe(false);
    expect(body.reason).toBe("Enabling for prod launch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: FAIL — `toggle_feature_flag` not registered.

- [ ] **Step 3: Implement `toggle_feature_flag`**

Add to `src/tools/features.ts`:

```typescript
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
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
```

Add the import for `formatFeatureFlagToggled`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/features.ts test/tools/write-tools-features.test.ts
git commit -m "feat: add toggle_feature_flag tool with test"
```

---

### Task 7: `add_feature_rule` Tool

**Files:**

- Modify: `src/tools/features.ts`
- Modify: `test/tools/write-tools-features.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/tools/write-tools-features.test.ts`:

```typescript
describe("add_feature_rule", () => {
  it("appends a force rule to a specific environment only", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      // GET: return existing flag with two environments
      if (!init?.method || init.method === "GET") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            feature: {
              id: "my-flag",
              valueType: "boolean",
              defaultValue: "false",
              environments: {
                production: {
                  enabled: true,
                  rules: [
                    { id: "existing-rule", type: "force", value: "true" },
                  ],
                },
                staging: { enabled: false, rules: [] },
              },
            },
          },
        });
      }
      // POST: return updated flag
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          feature: {
            id: "my-flag",
            valueType: "boolean",
            defaultValue: "false",
            environments: {
              production: {
                enabled: true,
                rules: [
                  { id: "existing-rule", type: "force", value: "true" },
                  {
                    id: "new-rule",
                    type: "force",
                    value: "false",
                    condition: '{"country":"CA"}',
                  },
                ],
              },
              staging: { enabled: false, rules: [] },
            },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerFeatureTools } =
      await import("../../src/tools/features.js");
    registerFeatureTools(baseArgs);

    const tool = tools.find((t) => t.name === "add_feature_rule");
    expect(tool).toBeTruthy();

    const p = tool!.handler({
      featureId: "my-flag",
      environment: "production",
      ruleType: "force",
      value: "false",
      condition: '{"country":"CA"}',
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("rule added");

    // Verify POST body: only production should have the new rule, staging unchanged
    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.environments.production.rules).toHaveLength(2);
    expect(body.environments.staging.rules).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `add_feature_rule`**

Add to `src/tools/features.ts`:

**Note:** The spec includes `fileExtension` for this tool, but we intentionally omit it here. This tool modifies an existing flag (the user already has SDK integration code), so an SDK snippet adds no value — consistent with `update_feature_flag` which also omits it.

```typescript
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
        .describe("Value to serve when rule matches (force) or rollout value"),
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
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

      // Build rule based on type
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

      // Clone environments, append rule only to the target environment
      const updatedEnvironments: Record<string, any> = {};
      for (const [env, config] of Object.entries(existingEnvironments)) {
        if (env === environment) {
          updatedEnvironments[env] = {
            ...config,
            rules: [...(config.rules || []), newRule],
          };
        } else {
          updatedEnvironments[env] = config;
        }
      }

      // If the target environment doesn't exist yet, create it
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
```

Add the import for `formatFeatureRuleAdded`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/features.ts test/tools/write-tools-features.test.ts
git commit -m "feat: add add_feature_rule tool with test"
```

---

### Task 8: `reorder_feature_rules` and `remove_feature_rule` Tools

**Files:**

- Modify: `src/tools/features.ts`
- Modify: `test/tools/write-tools-features.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/tools/write-tools-features.test.ts`:

```typescript
describe("reorder_feature_rules", () => {
  it("reorders rules for the specified environment", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      if (!init?.method || init.method === "GET") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            feature: {
              id: "my-flag",
              environments: {
                production: {
                  enabled: true,
                  rules: [
                    { id: "rule-a", type: "force", value: "1" },
                    { id: "rule-b", type: "force", value: "2" },
                    { id: "rule-c", type: "force", value: "3" },
                  ],
                },
              },
            },
          },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: { feature: { id: "my-flag", environments: {} } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerFeatureTools } =
      await import("../../src/tools/features.js");
    registerFeatureTools(baseArgs);

    const tool = tools.find((t) => t.name === "reorder_feature_rules");
    const p = tool!.handler({
      featureId: "my-flag",
      environment: "production",
      ruleIds: ["rule-c", "rule-a", "rule-b"],
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("reordered");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const ruleIds = body.environments.production.rules.map((r: any) => r.id);
    expect(ruleIds).toEqual(["rule-c", "rule-a", "rule-b"]);
  });
});

describe("remove_feature_rule", () => {
  it("removes the specified rule from the environment", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      if (!init?.method || init.method === "GET") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            feature: {
              id: "my-flag",
              environments: {
                production: {
                  enabled: true,
                  rules: [
                    { id: "rule-a", type: "force", value: "1" },
                    { id: "rule-b", type: "force", value: "2" },
                  ],
                },
              },
            },
          },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: { feature: { id: "my-flag", environments: {} } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerFeatureTools } =
      await import("../../src/tools/features.js");
    registerFeatureTools(baseArgs);

    const tool = tools.find((t) => t.name === "remove_feature_rule");
    const p = tool!.handler({
      featureId: "my-flag",
      environment: "production",
      ruleId: "rule-a",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("removed");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const ruleIds = body.environments.production.rules.map((r: any) => r.id);
    expect(ruleIds).toEqual(["rule-b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement both tools**

Add to `src/tools/features.ts`:

```typescript
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
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

      // Validate completeness: all existing rules must be accounted for
      if (ruleIds.length !== existingRules.length) {
        throw new Error(
          `Expected ${existingRules.length} rule IDs but received ${ruleIds.length}. All existing rule IDs for the environment must be included.`,
        );
      }

      // Validate all provided IDs exist
      for (const id of ruleIds) {
        if (!ruleMap.has(id)) {
          throw new Error(
            `Rule '${id}' not found in environment '${environment}'.`,
          );
        }
      }

      // Reorder
      const reorderedRules = ruleIds.map((id) => ruleMap.get(id));

      const updatedEnvironments = {
        ...existingFeature.environments,
        [environment]: {
          ...envConfig,
          rules: reorderedRules,
        },
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
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
        [environment]: {
          ...envConfig,
          rules: filteredRules,
        },
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
```

Add imports for `formatFeatureRulesReordered` and `formatFeatureRuleRemoved`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/write-tools-features.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite and build**

Run: `npm run build && npm test`
Expected: Clean build and all tests pass.

- [ ] **Step 6: Update manifest.json**

Add these 5 entries to the `tools` array in `manifest.json`:

```json
{
  "name": "update_feature_flag",
  "description": "Update properties of an existing feature flag (description, owner, tags, archived, defaultValue)."
},
{
  "name": "toggle_feature_flag",
  "description": "Enable or disable a feature flag in specific environments."
},
{
  "name": "add_feature_rule",
  "description": "Add a targeting rule (force or rollout) to a specific environment on a feature flag."
},
{
  "name": "reorder_feature_rules",
  "description": "Set the evaluation order of rules for a specific environment on a feature flag."
},
{
  "name": "remove_feature_rule",
  "description": "Remove a specific rule from an environment on a feature flag."
}
```

- [ ] **Step 7: Commit Phase 1**

```bash
git add src/tools/features.ts test/tools/write-tools-features.test.ts manifest.json
git commit -m "feat: complete Phase 1 — feature flag write tools (5 tools)"
```

---

## Chunk 3: Phase 2 — Experiment Lifecycle Tools

### Task 9: `update_experiment` and `archive_experiment` Tools

**Files:**

- Modify: `src/tools/experiments/experiments.ts`
- Create: `test/tools/write-tools-experiments.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/tools/write-tools-experiments.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type RegisteredTool = {
  name: string;
  config: any;
  handler: (args: any, extra?: any) => Promise<any>;
};

function makeServerCapture() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      config: any,
      handler: (args: any, extra?: any) => Promise<any>,
    ) => {
      tools.push({ name, config, handler });
    },
    server: { notification: vi.fn(async () => {}) },
  };
  return { server: server as any, tools };
}

function makeResponse(opts: { ok: boolean; status: number; json: any }) {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: "",
    headers: new Headers(),
    json: async () => opts.json,
    text: async () => JSON.stringify(opts.json),
  } as any as Response;
}

const baseArgs = {
  server: null as any,
  baseApiUrl: "https://api.example.com",
  apiKey: "key",
  appOrigin: "https://app.example.com",
  user: "u@example.com",
};

describe("update_experiment", () => {
  it("sends only provided fields", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            name: "Updated Name",
            status: "draft",
            type: "standard",
            variations: [],
            phases: [],
            settings: { goals: [], guardrails: [], secondaryMetrics: [] },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;

    vi.doMock("../../src/tools/defaults.js", () => ({
      getDefaults: vi.fn(async () => ({
        environments: ["production"],
        datasource: "ds_1",
        assignmentQuery: "aq_1",
      })),
    }));

    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(false);

    const p = tool!.handler({
      experimentId: "exp_1",
      name: "Updated Name",
      hypothesis: "New hypothesis",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("updated");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.name).toBe("Updated Name");
    expect(body.hypothesis).toBe("New hypothesis");
    expect(body.status).toBeUndefined();
  });
});

describe("archive_experiment", () => {
  it("archives an experiment", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: { experiment: { id: "exp_1", archived: true } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "archive_experiment");
    expect(tool).toBeTruthy();

    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("archived");
    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.archived).toBe(true);
  });

  it("unarchives when archived=false", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: { experiment: { id: "exp_1", archived: false } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "archive_experiment");
    const p = tool!.handler({ experimentId: "exp_1", archived: false });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.content[0].text).toContain("unarchived");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools/write-tools-experiments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `update_experiment` and `archive_experiment`**

Add to `src/tools/experiments/experiments.ts` after the `create_experiment` tool registration, inside the `registerExperimentTools` function:

```typescript
/**
 * Tool: update_experiment
 */
server.registerTool(
  "update_experiment",
  {
    title: "Update Experiment",
    description:
      "Updates properties of an existing experiment. Only the provided fields are changed. For lifecycle changes, use start_experiment, stop_experiment, or archive_experiment instead.",
    inputSchema: z.object({
      experimentId: z.string().describe("Experiment ID"),
      name: z.string().optional().describe("Updated name"),
      description: z.string().optional().describe("Updated description"),
      hypothesis: z.string().optional().describe("Updated hypothesis"),
      tags: z.array(z.string()).optional().describe("Replace tags"),
      owner: z.string().optional().describe("Owner email"),
      project: z.string().optional().describe("Move to project"),
      metrics: z.array(z.string()).optional().describe("Goal metric IDs"),
      guardrailMetrics: z
        .array(z.string())
        .optional()
        .describe("Guardrail metric IDs"),
      secondaryMetrics: z
        .array(z.string())
        .optional()
        .describe("Secondary metric IDs"),
      activationMetric: z.string().optional().describe("Activation metric ID"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
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
          { type: "text", text: formatExperimentUpdated(data, appOrigin) },
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
        .describe("Set to true to archive, false to unarchive (default: true)"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async ({ experimentId, archived }) => {
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
```

Add imports for `formatExperimentUpdated` and `formatExperimentArchived` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/write-tools-experiments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/experiments/experiments.ts test/tools/write-tools-experiments.test.ts
git commit -m "feat: add update_experiment and archive_experiment tools with tests"
```

---

### Task 10: `start_experiment` and `stop_experiment` Tools

**Files:**

- Modify: `src/tools/experiments/experiments.ts`
- Modify: `test/tools/write-tools-experiments.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/tools/write-tools-experiments.test.ts`:

```typescript
describe("start_experiment", () => {
  it("sets status to running and creates a phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      // GET: return draft experiment
      if (!init?.method || init.method === "GET") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            experiment: {
              id: "exp_1",
              name: "Test",
              status: "draft",
              type: "standard",
              variations: [
                { variationId: "v0", key: "0", name: "Control" },
                { variationId: "v1", key: "1", name: "Treatment" },
              ],
              phases: [],
              settings: { goals: [], guardrails: [], secondaryMetrics: [] },
            },
          },
        });
      }
      // POST: return running experiment
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            name: "Test",
            status: "running",
            type: "standard",
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
            phases: [{ name: "Phase 1", dateStarted: "2026-03-11T00:00:00Z" }],
            settings: { goals: [], guardrails: [], secondaryMetrics: [] },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "start_experiment");
    expect(tool).toBeTruthy();

    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("started");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBe("running");
    expect(body.phases).toHaveLength(1);
    expect(body.phases[0].trafficSplit).toHaveLength(2);
    // Equal split
    expect(body.phases[0].trafficSplit[0].weight).toBe(0.5);
  });

  it("rejects non-draft experiments", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            status: "running",
            variations: [],
            phases: [],
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "start_experiment");
    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    // Should return an error message, not throw
    expect(res.content[0].text).toContain("draft");
  });
});

describe("stop_experiment", () => {
  it("sets status to stopped with winner and closes last phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      if (!init?.method || init.method === "GET") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            experiment: {
              id: "exp_1",
              name: "Test",
              status: "running",
              type: "standard",
              variations: [
                { variationId: "v0", key: "0", name: "Control" },
                { variationId: "v1", key: "1", name: "Treatment" },
              ],
              phases: [
                { name: "Phase 1", dateStarted: "2026-03-01T00:00:00Z" },
              ],
              settings: { goals: [], guardrails: [], secondaryMetrics: [] },
            },
          },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            name: "Test",
            status: "stopped",
            type: "standard",
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
            phases: [
              {
                name: "Phase 1",
                dateStarted: "2026-03-01T00:00:00Z",
                dateEnded: "2026-03-11T00:00:00Z",
                reasonForStopping: "Treatment won",
              },
            ],
            settings: { goals: [], guardrails: [], secondaryMetrics: [] },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "stop_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      releasedVariationId: "v1",
      reason: "Treatment won",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("stopped");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBe("stopped");
    expect(body.releasedVariationId).toBe("v1");
    // Phases should include dateEnded on last phase
    expect(body.phases[0].dateEnded).toBeTruthy();
    expect(body.phases[0].reasonForStopping).toBe("Treatment won");
  });

  it("rejects non-running experiments", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            status: "stopped",
            variations: [],
            phases: [],
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "stop_experiment");
    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("running");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools/write-tools-experiments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `start_experiment` and `stop_experiment`**

Add to `src/tools/experiments/experiments.ts`:

```typescript
/**
 * Tool: start_experiment
 */
server.registerTool(
  "start_experiment",
  {
    title: "Start Experiment",
    description:
      "Launches a draft experiment into 'running' status. The experiment must be in 'draft' status. Use get_experiments to check status first. Use update_experiment to configure metrics before launching.",
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
            weight: z.number(),
          }),
        )
        .optional()
        .describe(
          "Custom traffic split. Defaults to equal split across all variations.",
        ),
      targetingCondition: z
        .string()
        .optional()
        .describe("MongoDB-style targeting for experiment entry"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async ({ experimentId, coverage, trafficSplit, targetingCondition }) => {
    try {
      // Fetch experiment to validate status and get variations
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

      // Build traffic split
      const split =
        trafficSplit ||
        experiment.variations.map((v: any) => ({
          variationId: v.variationId,
          weight: 1 / experiment.variations.length,
        }));

      const newPhase = {
        name: "Phase 1",
        dateStarted: new Date().toISOString(),
        coverage: coverage ?? 1.0,
        trafficSplit: split,
        ...(targetingCondition && { targetingCondition }),
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
          { type: "text", text: formatExperimentStarted(data, appOrigin) },
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
 * Tool: stop_experiment
 */
server.registerTool(
  "stop_experiment",
  {
    title: "Stop Experiment",
    description:
      "Stops a running experiment. To declare a winner, provide the releasedVariationId — use get_experiments with the experimentId first to see available variation IDs and their names.",
    inputSchema: z.object({
      experimentId: z.string().describe("Experiment ID"),
      releasedVariationId: z
        .string()
        .optional()
        .describe(
          "Variation ID to declare as winner. Use get_experiments to find variation IDs.",
        ),
      reason: z.string().optional().describe("Why the experiment was stopped"),
      excludeFromPayload: z
        .boolean()
        .optional()
        .default(false)
        .describe("Remove from SDK payloads after stopping (default: false)"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async ({ experimentId, releasedVariationId, reason, excludeFromPayload }) => {
    try {
      // Fetch experiment to get current phases
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

      // Copy full phases array, modify only the last phase
      const phases = [...(experiment.phases || [])];
      if (phases.length > 0) {
        const lastPhase = { ...phases[phases.length - 1] };
        lastPhase.dateEnded = new Date().toISOString();
        if (reason) lastPhase.reasonForStopping = reason;
        phases[phases.length - 1] = lastPhase;
      }

      const payload: Record<string, any> = {
        status: "stopped",
        phases,
      };
      if (releasedVariationId)
        payload.releasedVariationId = releasedVariationId;
      if (excludeFromPayload) payload.excludeFromPayload = excludeFromPayload;

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
```

Add imports for `formatExperimentStarted` and `formatExperimentStopped`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/write-tools-experiments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/experiments/experiments.ts test/tools/write-tools-experiments.test.ts
git commit -m "feat: add start_experiment and stop_experiment tools with tests"
```

---

### Task 11: `refresh_experiment_results` Tool

**Files:**

- Modify: `src/tools/experiments/experiments.ts`
- Modify: `test/tools/write-tools-experiments.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/tools/write-tools-experiments.test.ts`:

```typescript
describe("refresh_experiment_results", () => {
  it("creates snapshot and returns success when complete", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      callCount++;
      // POST snapshot
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
      // GET snapshot status (first poll: running, second: success)
      if (url.includes("/snapshots/")) {
        if (callCount <= 3) {
          return makeResponse({
            ok: true,
            status: 200,
            json: { snapshot: { id: "snap_1", status: "running" } },
          });
        }
        return makeResponse({
          ok: true,
          status: 200,
          json: { snapshot: { id: "snap_1", status: "success" } },
        });
      }
      // GET experiment results
      return makeResponse({
        ok: true,
        status: 200,
        json: { result: { variations: [] } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "refresh_experiment_results");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.idempotentHint).toBe(true);

    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("refreshed");
  });

  it("returns timeout when snapshot stays running", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      // POST snapshot
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
      // All polls return running
      return makeResponse({
        ok: true,
        status: 200,
        json: { snapshot: { id: "snap_1", status: "running" } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "refresh_experiment_results");
    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("timeout");
    expect(res.content[0].text).toContain("snap_1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/write-tools-experiments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `refresh_experiment_results`**

Add to `src/tools/experiments/experiments.ts`:

```typescript
/**
 * Tool: refresh_experiment_results
 */
server.registerTool(
  "refresh_experiment_results",
  {
    title: "Refresh Experiment Results",
    description:
      "Triggers a fresh analysis snapshot for an experiment. Polls for completion and returns the latest results. Safe to call multiple times.",
    inputSchema: z.object({
      experimentId: z.string().describe("Experiment ID"),
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
    },
  },
  async ({ experimentId }) => {
    try {
      // Create snapshot
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

      // Poll for completion with exponential backoff
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
              ),
            },
          ],
        };
      }

      // Check for error states before assuming success
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
              ),
            },
          ],
        };
      }

      // Fetch fresh results
      const resultsRes = await fetchWithRateLimit(
        `${baseApiUrl}/api/v1/experiments/${experimentId}/results`,
        { headers: buildHeaders(apiKey, false) },
      );
      await handleResNotOk(resultsRes);

      return {
        content: [
          {
            type: "text",
            text: formatSnapshotResult(experimentId, "success", appOrigin),
          },
        ],
      };
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
```

Add import for `formatSnapshotResult`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/write-tools-experiments.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite and build**

Run: `npm run build && npm test`
Expected: All pass.

- [ ] **Step 6: Update manifest.json**

Add these 5 entries to the `tools` array:

```json
{
  "name": "update_experiment",
  "description": "Update properties of an existing experiment (name, description, hypothesis, metrics, tags)."
},
{
  "name": "start_experiment",
  "description": "Launch a draft experiment into running status with traffic allocation."
},
{
  "name": "stop_experiment",
  "description": "Stop a running experiment, optionally declaring a winning variation."
},
{
  "name": "archive_experiment",
  "description": "Archive or unarchive an experiment (soft delete)."
},
{
  "name": "refresh_experiment_results",
  "description": "Trigger a fresh analysis snapshot for an experiment and return results."
}
```

- [ ] **Step 7: Commit Phase 2**

```bash
git add src/tools/experiments/experiments.ts test/tools/write-tools-experiments.test.ts manifest.json
git commit -m "feat: complete Phase 2 — experiment lifecycle tools (5 tools)"
```

---

## Chunk 4: Phase 3 — Metrics Tools

### Task 12: `create_fact_metric`, `update_fact_metric`, `list_fact_tables`, `list_fact_metrics` Tools

**Files:**

- Modify: `src/tools/metrics.ts`
- Create: `test/tools/write-tools-metrics.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/tools/write-tools-metrics.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type RegisteredTool = {
  name: string;
  config: any;
  handler: (args: any, extra?: any) => Promise<any>;
};

function makeServerCapture() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      config: any,
      handler: (args: any, extra?: any) => Promise<any>,
    ) => {
      tools.push({ name, config, handler });
    },
    server: { notification: vi.fn(async () => {}) },
  };
  return { server: server as any, tools };
}

function makeResponse(opts: { ok: boolean; status: number; json: any }) {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: "",
    headers: new Headers(),
    json: async () => opts.json,
    text: async () => JSON.stringify(opts.json),
  } as any as Response;
}

const baseArgs = {
  server: null as any,
  baseApiUrl: "https://api.example.com",
  apiKey: "key",
  appOrigin: "https://app.example.com",
  user: "u@example.com",
};

describe("create_fact_metric", () => {
  it("sends metric payload and returns formatted result", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factMetric: {
            id: "fact__conv",
            name: "Conversion Rate",
            metricType: "proportion",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "create_fact_metric");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(false);

    const p = tool!.handler({
      name: "Conversion Rate",
      metricType: "proportion",
      numerator: { factTableId: "ft_1", column: "value" },
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("created");
    expect(res.content[0].text).toContain("Conversion Rate");
  });
});

describe("update_fact_metric", () => {
  it("sends only changed fields", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factMetric: {
            id: "fact__conv",
            name: "Updated Name",
            metricType: "proportion",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_fact_metric");
    const p = tool!.handler({ metricId: "fact__conv", name: "Updated Name" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("updated");
    const postCall = calls.find((c) => c.url.includes("fact__conv"));
    expect(postCall).toBeTruthy();
  });
});

describe("list_fact_tables", () => {
  it("returns formatted list", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factTables: [
            {
              id: "ft_1",
              name: "Events",
              sql: "SELECT * FROM events",
              datasource: "ds_1",
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "list_fact_tables");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(true);

    const p = tool!.handler({ limit: 100, offset: 0 });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("Events");
    expect(res.content[0].text).toContain("ft_1");
  });
});

describe("list_fact_metrics", () => {
  it("returns formatted list with types", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factMetrics: [
            { id: "fact__m1", name: "Conv Rate", metricType: "proportion" },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "list_fact_metrics");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(true);

    const p = tool!.handler({ limit: 100, offset: 0 });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("Conv Rate");
    expect(res.content[0].text).toContain("proportion");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools/write-tools-metrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement all 4 metrics tools**

Add to `src/tools/metrics.ts` after the existing `get_metrics` tool registration, still inside `registerMetricsTools`:

```typescript
/**
 * Tool: create_fact_metric
 */
server.registerTool(
  "create_fact_metric",
  {
    title: "Create Fact Metric",
    description:
      "Creates a new fact metric. Fact metrics are the modern metric type in GrowthBook, recommended for new setups. Use list_fact_tables to discover available fact table IDs.",
    inputSchema: z.object({
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
      offset: z.number().min(0).default(0).describe("Number of items to skip"),
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
      offset: z.number().min(0).default(0).describe("Number of items to skip"),
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
```

Add imports at the top of `metrics.ts`:

```typescript
import {
  formatMetricsList,
  formatMetricDetail,
  formatApiError,
  formatFactMetricCreated,
  formatFactMetricUpdated,
  formatFactTableList,
  formatFactMetricList,
} from "../format-responses.js";
```

**Important:** The `user` parameter must be destructured from the function signature. Update the existing function signature in `src/tools/metrics.ts` from:

```typescript
export function registerMetricsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
}: MetricsTools) {
```

to:

```typescript
export function registerMetricsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: MetricsTools) {
```

The `ExtendedToolsInterface` already includes `user: string` and `src/index.ts` already passes it. Only the destructuring is missing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/write-tools-metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite and build**

Run: `npm run build && npm test`
Expected: All pass.

- [ ] **Step 6: Update manifest.json**

Add these 4 entries to the `tools` array:

```json
{
  "name": "create_fact_metric",
  "description": "Create a new fact metric for measuring experiment success."
},
{
  "name": "update_fact_metric",
  "description": "Update an existing fact metric."
},
{
  "name": "list_fact_tables",
  "description": "List available fact tables (SQL data sources for fact metrics)."
},
{
  "name": "list_fact_metrics",
  "description": "List fact metrics with full configuration details."
}
```

- [ ] **Step 7: Commit Phase 3**

```bash
git add src/tools/metrics.ts test/tools/write-tools-metrics.test.ts manifest.json
git commit -m "feat: complete Phase 3 — metrics tools (4 tools)"
```

---

## Chunk 5: Final Integration

### Task 13: Update `create_force_rule` Description and Final Verification

**Files:**

- Modify: `src/tools/features.ts`

- [ ] **Step 1: Update `create_force_rule` description**

In `src/tools/features.ts`, update the `create_force_rule` tool description to mention `add_feature_rule`:

Change the description string to:

```
'Adds a targeting rule to an existing feature flag that forces a specific value when conditions are met. This applies the rule to ALL default environments. For per-environment control, use add_feature_rule instead. ...(rest of existing description)...'
```

Specifically, prepend "This applies the rule to ALL default environments. For per-environment control, use add_feature_rule instead." after the first sentence.

- [ ] **Step 2: Run full build and test suite**

Run: `npm run build && npm test`
Expected: Clean build, all tests pass.

- [ ] **Step 3: Verify tool count in manifest**

Run: `node -e "console.log(require('./manifest.json').tools.length)"` (via Bash)
Expected: should show 32 (18 existing + 14 new).

- [ ] **Step 4: Final commit**

```bash
git add src/tools/features.ts
git commit -m "chore: update create_force_rule description to reference add_feature_rule"
```

- [ ] **Step 5: Update CHANGELOG.md**

Add a new version section at the top of `CHANGELOG.md` with all 14 new tools:

```markdown
## [next version]

### Added

- `update_feature_flag` — Update properties of an existing feature flag
- `toggle_feature_flag` — Enable or disable a feature flag per-environment
- `add_feature_rule` — Add a targeting rule to a specific environment
- `reorder_feature_rules` — Set rule evaluation order for an environment
- `remove_feature_rule` — Remove a rule from an environment
- `update_experiment` — Update experiment properties
- `start_experiment` — Launch a draft experiment
- `stop_experiment` — Stop a running experiment, optionally declare winner
- `archive_experiment` — Archive or unarchive an experiment
- `refresh_experiment_results` — Trigger fresh analysis snapshot
- `create_fact_metric` — Create a new fact metric
- `update_fact_metric` — Update an existing fact metric
- `list_fact_tables` — List available fact tables
- `list_fact_metrics` — List fact metrics with full configuration
```

- [ ] **Step 6: Version bump**

Run: `npm run bump:minor`

This updates `package.json`, `manifest.json`, and `server.json` to the next minor version. Then update the `[next version]` placeholder in CHANGELOG.md with the actual version number.

- [ ] **Step 7: Commit version bump + changelog**

```bash
git add package.json manifest.json server.json CHANGELOG.md
git commit -m "chore: bump version to $(node -p 'require(\"./package.json\").version') with changelog"
```
