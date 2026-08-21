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

describe("create_experiment", () => {
  it("forwards custom variation keys to the API", async () => {
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
            name: "Coupon test",
            status: "draft",
            type: "standard",
            trackingKey: "coupon-test",
            variations: [
              { variationId: "v0", key: "control", name: "Control" },
              { variationId: "v1", key: "coupon_a", name: "Coupon A" },
            ],
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

    const tool = tools.find((t) => t.name === "create_experiment");
    expect(tool).toBeTruthy();

    const p = tool!.handler({
      name: "Coupon test",
      valueType: "string",
      variations: [
        { name: "Control", value: "ctrl", key: "control" },
        { name: "Coupon A", value: "coupon_a", key: "coupon_a" },
      ],
      fileExtension: "ts",
      confirmedDefaultsReviewed: true,
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("created");
    expect(res.content[0].text).toContain("`control`");
    expect(res.content[0].text).toContain("`coupon_a`");

    const postCall = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/experiments"),
    );
    const body = JSON.parse(postCall!.body!);
    expect(body.variations).toEqual([
      { key: "control", name: "Control" },
      { key: "coupon_a", name: "Coupon A" },
    ]);
  });

  it("defaults variation keys to the array index when omitted (back-compat)", async () => {
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
            name: "Boolean test",
            status: "draft",
            type: "standard",
            trackingKey: "boolean-test",
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
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

    const tool = tools.find((t) => t.name === "create_experiment");
    const p = tool!.handler({
      name: "Boolean test",
      valueType: "boolean",
      variations: [
        { name: "Control", value: false },
        { name: "Treatment", value: true },
      ],
      fileExtension: "ts",
      confirmedDefaultsReviewed: true,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/experiments"),
    );
    const body = JSON.parse(postCall!.body!);
    expect(body.variations).toEqual([
      { key: "0", name: "Control" },
      { key: "1", name: "Treatment" },
    ]);
  });

  it("rejects an empty variation key at the schema layer", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
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

    const tool = tools.find((t) => t.name === "create_experiment");
    const result = tool!.config.inputSchema.safeParse({
      name: "Empty key test",
      valueType: "string",
      variations: [
        { name: "Control", value: "ctrl", key: "" },
        { name: "Treatment", value: "trmt", key: "treatment" },
      ],
      fileExtension: "ts",
      confirmedDefaultsReviewed: true,
    });
    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("update_experiment", () => {
  it("rejects an empty variation key at the schema layer", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;

    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment");
    const result = tool!.config.inputSchema.safeParse({
      experimentId: "exp_1",
      variations: [{ id: "v0", key: "", name: "Control" }],
    });
    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards a replacement variations array to the API", async () => {
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
            name: "Coupon test",
            status: "draft",
            type: "standard",
            variations: [
              { variationId: "v0", key: "control", name: "Control" },
              { variationId: "v1", key: "coupon_a", name: "Coupon A" },
            ],
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
    const p = tool!.handler({
      experimentId: "exp_1",
      variations: [
        { id: "v0", key: "control", name: "Control" },
        { id: "v1", key: "coupon_a", name: "Coupon A" },
      ],
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.variations).toEqual([
      { id: "v0", key: "control", name: "Control" },
      { id: "v1", key: "coupon_a", name: "Coupon A" },
    ]);
    expect(body.status).toBeUndefined();
  });

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
      trackingKey: "cro-memories-step-variant",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("updated");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.name).toBe("Updated Name");
    expect(body.hypothesis).toBe("New hypothesis");
    expect(body.trackingKey).toBe("cro-memories-step-variant");
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

describe("start_experiment", () => {
  it("sets status to running and creates a phase", async () => {
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
    expect(body.phases[0].variationWeights).toEqual([0.5, 0.5]);
    expect(body.phases[0].trafficSplit).toBeUndefined();
    expect(body.phases[0].condition).toBe("{}");
    expect(body.phases[0].targetingCondition).toBe("{}");
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

    expect(res.content[0].text).toContain("draft");
  });

  it("rejects invalid trafficSplit (duplicate IDs, bad weights)", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            status: "draft",
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
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

    // Duplicate variationIds
    const p1 = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v0", weight: 0.5 },
        { variationId: "v0", weight: 0.5 },
      ],
    });
    await vi.runAllTimersAsync();
    const res1 = await p1;
    expect(res1.content[0].text).toContain("Invalid trafficSplit");

    // Weights don't sum to 1
    const p2 = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v0", weight: 0.3 },
        { variationId: "v1", weight: 0.3 },
      ],
    });
    await vi.runAllTimersAsync();
    const res2 = await p2;
    expect(res2.content[0].text).toContain("Invalid trafficSplit");
  });

  it("passes through valid targetingCondition into the new phase", async () => {
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
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"country":"US"}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases[0].targetingCondition).toBe('{"country":"US"}');
    expect(body.phases[0].condition).toBe('{"country":"US"}');
  });

  it("defaults targetingCondition to '{}' when not provided", async () => {
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
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases[0].targetingCondition).toBe("{}");
  });

  it("rejects malformed targetingCondition JSON via Zod before any HTTP call", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "start_experiment");
    const schema = tool!.config.inputSchema;
    const result = schema.safeParse({
      experimentId: "exp_1",
      targetingCondition: "{not valid json",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("valid JSON");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves a pre-seeded phase from a draft when no overrides are passed", async () => {
    vi.useFakeTimers();
    const seededDateStarted = "2026-03-01T00:00:00Z";
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
              status: "draft",
              type: "standard",
              variations: [
                { variationId: "v0", key: "0", name: "Control" },
                { variationId: "v1", key: "1", name: "Treatment" },
              ],
              phases: [
                {
                  name: "SEM Non-Brand",
                  dateStarted: seededDateStarted,
                  coverage: 0.5,
                  variationWeights: [0.7, 0.3],
                  condition: '{"utmCampaign":"abc"}',
                  savedGroupTargeting: [
                    { matchType: "all", savedGroups: ["sg_premium"] },
                  ],
                  prerequisites: [
                    { id: "prereq_1", condition: '{"value":true}' },
                  ],
                  namespace: { namespaceId: "ns_a", range: [0, 0.5] },
                },
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
            status: "running",
            type: "standard",
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
            phases: [{ name: "SEM Non-Brand", dateStarted: seededDateStarted }],
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
    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("started");

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBe("running");
    expect(body.phases).toHaveLength(1);
    const phase = body.phases[0];

    expect(phase.name).toBe("SEM Non-Brand");
    expect(phase.coverage).toBe(0.5);
    expect(phase.variationWeights).toEqual([0.7, 0.3]);
    expect(phase.trafficSplit).toBeUndefined();
    expect(phase.condition).toBe('{"utmCampaign":"abc"}');
    expect(phase.targetingCondition).toBe('{"utmCampaign":"abc"}');
    expect(phase.savedGroupTargeting).toEqual([
      { matchType: "all", savedGroups: ["sg_premium"] },
    ]);
    expect(phase.prerequisites).toEqual([
      { id: "prereq_1", condition: '{"value":true}' },
    ]);
    expect(phase.namespace).toEqual({ namespaceId: "ns_a", range: [0, 0.5] });

    // dateStarted should be refreshed to launch time, not the seeded value.
    expect(typeof phase.dateStarted).toBe("string");
    expect(phase.dateStarted).not.toBe(seededDateStarted);
    expect(phase.dateEnded).toBeUndefined();
    expect(phase.reason).toBeUndefined();
  });

  it("lets explicit launch-time args override seeded phase fields while preserving the rest", async () => {
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
              status: "draft",
              type: "standard",
              variations: [
                { variationId: "v0", key: "0", name: "Control" },
                { variationId: "v1", key: "1", name: "Treatment" },
              ],
              phases: [
                {
                  name: "SEM Non-Brand",
                  dateStarted: "2026-03-01T00:00:00Z",
                  coverage: 0.5,
                  variationWeights: [0.7, 0.3],
                  condition: '{"utmCampaign":"abc"}',
                  savedGroupTargeting: [
                    { matchType: "all", savedGroups: ["sg_premium"] },
                  ],
                  prerequisites: [
                    { id: "prereq_1", condition: '{"value":true}' },
                  ],
                  namespace: { namespaceId: "ns_a", range: [0, 0.5] },
                },
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
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 1.0,
      targetingCondition: '{"country":"US"}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const phase = body.phases[0];

    // Overrides applied.
    expect(phase.coverage).toBe(1.0);
    expect(phase.condition).toBe('{"country":"US"}');
    expect(phase.targetingCondition).toBe('{"country":"US"}');

    // Non-overridden seeded fields preserved.
    expect(phase.name).toBe("SEM Non-Brand");
    expect(phase.variationWeights).toEqual([0.7, 0.3]);
    expect(phase.savedGroupTargeting).toEqual([
      { matchType: "all", savedGroups: ["sg_premium"] },
    ]);
    expect(phase.prerequisites).toEqual([
      { id: "prereq_1", condition: '{"value":true}' },
    ]);
    expect(phase.namespace).toEqual({ namespaceId: "ns_a", range: [0, 0.5] });
  });

  it("drops stale seeded variationWeights when variation count changed since seed and falls back to equal split", async () => {
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
              status: "draft",
              type: "standard",
              // 3 variations now, but the seeded phase still has 2 weights.
              variations: [
                { variationId: "v0", key: "0", name: "Control" },
                { variationId: "v1", key: "1", name: "Treatment" },
                { variationId: "v2", key: "2", name: "Treatment B" },
              ],
              phases: [
                {
                  name: "SEM Non-Brand",
                  dateStarted: "2026-03-01T00:00:00Z",
                  coverage: 0.5,
                  variationWeights: [0.7, 0.3],
                  condition: '{"utmCampaign":"abc"}',
                  savedGroupTargeting: [
                    { matchType: "all", savedGroups: ["sg_premium"] },
                  ],
                  prerequisites: [
                    { id: "prereq_1", condition: '{"value":true}' },
                  ],
                  namespace: { namespaceId: "ns_a", range: [0, 0.5] },
                },
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
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const phase = body.phases[0];

    // Stale 2-element weights dropped; equal-split across the 3 current variations.
    expect(phase.variationWeights).toHaveLength(3);
    for (const w of phase.variationWeights) {
      expect(w).toBeCloseTo(1 / 3, 10);
    }

    // Other preserved fields still survive the weight reset.
    expect(phase.name).toBe("SEM Non-Brand");
    expect(phase.coverage).toBe(0.5);
    expect(phase.condition).toBe('{"utmCampaign":"abc"}');
    expect(phase.targetingCondition).toBe('{"utmCampaign":"abc"}');
    expect(phase.savedGroupTargeting).toEqual([
      { matchType: "all", savedGroups: ["sg_premium"] },
    ]);
    expect(phase.prerequisites).toEqual([
      { id: "prereq_1", condition: '{"value":true}' },
    ]);
    expect(phase.namespace).toEqual({ namespaceId: "ns_a", range: [0, 0.5] });
  });

  it("realigns weights by variationId when source phase has trafficSplit IDs (variations reordered between seed and launch)", async () => {
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
              status: "draft",
              type: "standard",
              // Variations reordered after the phase was seeded (v1 first).
              variations: [
                { variationId: "v1", key: "1", name: "Treatment" },
                { variationId: "v0", key: "0", name: "Control" },
              ],
              phases: [
                {
                  name: "Phase 1",
                  dateStarted: "2026-03-01T00:00:00Z",
                  coverage: 1,
                  // External seeder (GrowthBook UI) — phase carries IDs.
                  trafficSplit: [
                    { variationId: "v0", weight: 0.7 },
                    { variationId: "v1", weight: 0.3 },
                  ],
                  condition: "{}",
                },
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
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    // Weights re-keyed by ID: v1's weight (0.3) now first, v0's (0.7) second.
    expect(body.phases[0].variationWeights).toEqual([0.3, 0.7]);
  });

  it("falls back to equal split when source trafficSplit IDs don't cover current variations (variation replaced)", async () => {
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
              status: "draft",
              type: "standard",
              // v1 was replaced by v2 after seed; seeded IDs are stale.
              variations: [
                { variationId: "v0", key: "0", name: "Control" },
                { variationId: "v2", key: "2", name: "New Treatment" },
              ],
              phases: [
                {
                  name: "Phase 1",
                  dateStarted: "2026-03-01T00:00:00Z",
                  coverage: 1,
                  trafficSplit: [
                    { variationId: "v0", weight: 0.7 },
                    { variationId: "v1", weight: 0.3 },
                  ],
                  condition: "{}",
                },
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
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases[0].variationWeights).toEqual([0.5, 0.5]);
  });

  it("remaps user-supplied trafficSplit weights to experiment.variations order", async () => {
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
    // Pass trafficSplit in reverse order — v1 first with 0.7, v0 second with 0.3.
    // variationWeights on the POST must be ordered to match experiment.variations
    // ([v0, v1]) so v0=0.3 and v1=0.7, not the positional [0.7, 0.3].
    const p = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v1", weight: 0.7 },
        { variationId: "v0", weight: 0.3 },
      ],
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases[0].variationWeights).toEqual([0.3, 0.7]);
  });
});

describe("stop_experiment", () => {
  it("sets status to stopped with winner and closes last phase using reason field", async () => {
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
                {
                  name: "Phase 1",
                  dateStarted: "2026-03-01T00:00:00Z",
                  coverage: 1,
                  trafficSplit: [
                    { variationId: "v0", weight: 0.5 },
                    { variationId: "v1", weight: 0.5 },
                  ],
                  targetingCondition: '{"country":"US"}',
                },
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
    expect(body.phases[0].dateEnded).toBeTruthy();
    expect(body.phases[0].reason).toBe("Treatment won");
    expect(body.phases[0].reasonForStopping).toBeUndefined();
    expect(body.phases[0].targetingCondition).toBe('{"country":"US"}');
    expect(body.phases[0].condition).toBe('{"country":"US"}');
    expect(body.phases[0].variationWeights).toEqual([0.5, 0.5]);
    expect(body.phases[0].trafficSplit).toBeUndefined();
    expect(body.phases[0].prerequisites).toEqual([]);
    expect(body.phases[0].savedGroupTargeting).toEqual([]);
  });

  it("converts all existing phases through GET→POST shape converter", async () => {
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
              variations: [{ variationId: "v0", key: "0", name: "Control" }],
              phases: [
                {
                  name: "Phase 1",
                  dateStarted: "2026-03-01T00:00:00Z",
                  dateEnded: "2026-03-05T00:00:00Z",
                  reasonForStopping: "old reason",
                  coverage: 0.5,
                  trafficSplit: [{ variationId: "v0", weight: 1 }],
                  targetingCondition: '{"foo":"bar"}',
                },
                {
                  name: "Phase 2",
                  dateStarted: "2026-03-05T00:00:00Z",
                  coverage: 1,
                  trafficSplit: [{ variationId: "v0", weight: 1 }],
                  targetingCondition: '{"baz":"qux"}',
                },
              ],
              settings: { goals: [], guardrails: [], secondaryMetrics: [] },
            },
          },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: { experiment: { id: "exp_1", status: "stopped" } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "stop_experiment");
    const p = tool!.handler({ experimentId: "exp_1", reason: "done" });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(2);

    expect(body.phases[0].reason).toBe("old reason");
    expect(body.phases[0].reasonForStopping).toBeUndefined();
    expect(body.phases[0].dateEnded).toBe("2026-03-05T00:00:00Z");
    expect(body.phases[0].targetingCondition).toBe('{"foo":"bar"}');

    expect(body.phases[1].reason).toBe("done");
    expect(body.phases[1].reasonForStopping).toBeUndefined();
    expect(body.phases[1].dateEnded).toBeTruthy();
    expect(body.phases[1].targetingCondition).toBe('{"baz":"qux"}');
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

  it("round-trips condition field on all existing phases (server reads condition, not targetingCondition)", async () => {
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
              variations: [{ variationId: "v0", key: "0", name: "Control" }],
              phases: [
                {
                  name: "Phase 1",
                  dateStarted: "2026-03-01T00:00:00Z",
                  dateEnded: "2026-03-05T00:00:00Z",
                  coverage: 1,
                  variationWeights: [1],
                  targetingCondition: '{"foo":"bar"}',
                },
                {
                  name: "Phase 2",
                  dateStarted: "2026-03-05T00:00:00Z",
                  coverage: 1,
                  variationWeights: [1],
                  targetingCondition: '{"baz":"qux"}',
                },
              ],
              settings: { goals: [], guardrails: [], secondaryMetrics: [] },
            },
          },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: { experiment: { id: "exp_1", status: "stopped" } },
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
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0].condition).toBe('{"foo":"bar"}');
    expect(body.phases[0].targetingCondition).toBe('{"foo":"bar"}');
    expect(body.phases[0].variationWeights).toEqual([1]);
    expect(body.phases[1].condition).toBe('{"baz":"qux"}');
    expect(body.phases[1].targetingCondition).toBe('{"baz":"qux"}');
    expect(body.phases[1].variationWeights).toEqual([1]);
  });
});

describe("update_experiment_targeting", () => {
  function makeRunningExperimentJson(
    phases: any[] = [
      {
        name: "Phase 1",
        dateStarted: "2026-03-01T00:00:00Z",
        coverage: 1,
        trafficSplit: [
          { variationId: "v0", weight: 0.5 },
          { variationId: "v1", weight: 0.5 },
        ],
        targetingCondition: '{"utm_source":"facebook"}',
      },
    ],
  ) {
    return {
      experiment: {
        id: "exp_1",
        name: "Test",
        status: "running",
        type: "standard",
        variations: [
          { variationId: "v0", key: "0", name: "Control" },
          { variationId: "v1", key: "1", name: "Treatment" },
        ],
        phases,
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
  }

  function makeFetchSpy(
    calls: Array<{ url: string; method?: string; body?: string }>,
    initialJson: any,
  ) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      if (!init?.method || init.method === "GET") {
        return makeResponse({ ok: true, status: 200, json: initialJson });
      }
      return makeResponse({ ok: true, status: 200, json: initialJson });
    });
  }

  it("is registered with readOnlyHint: false", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(false);
    expect(tool!.config.annotations.destructiveHint).toBe(false);
    expect(tool!.config.annotations.idempotentHint).toBeUndefined();
  });

  it("newPhase mode appends a phase, ends previous, omits status", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeRunningExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"utm_source":"google"}',
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("targeting updated");

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBeUndefined();
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0].dateEnded).toBeTruthy();
    expect(body.phases[0].reasonForStopping).toBeUndefined();
    expect(body.phases[1].dateStarted).toBeTruthy();
    expect(body.phases[1].dateEnded).toBeUndefined();
    expect(body.phases[1].reason).toBeUndefined();
    expect(body.phases[1].reasonForStopping).toBeUndefined();
    expect(body.phases[1].name).toBe("Phase 2");
    expect(body.phases[1].targetingCondition).toBe('{"utm_source":"google"}');
    expect(body.phases[1].condition).toBe('{"utm_source":"google"}');
    expect(body.phases[1].variationWeights).toEqual([0.5, 0.5]);
    expect(body.phases[1].trafficSplit).toBeUndefined();
    expect(body.phases[1].prerequisites).toEqual([]);
    expect(body.phases[1].savedGroupTargeting).toEqual([]);
  });

  it("patchCurrent mode mutates current phase in place without new dateStarted", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeRunningExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      mode: "patchCurrent",
      coverage: 0.5,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBeUndefined();
    expect(body.phases).toHaveLength(1);
    expect(body.phases[0].dateStarted).toBe("2026-03-01T00:00:00Z");
    expect(body.phases[0].coverage).toBe(0.5);
    expect(body.phases[0].targetingCondition).toBe('{"utm_source":"facebook"}');
    expect(body.phases[0].condition).toBe('{"utm_source":"facebook"}');
    expect(body.phases[0].variationWeights).toEqual([0.5, 0.5]);
    expect(body.phases[0].trafficSplit).toBeUndefined();
    expect(body.phases[0].prerequisites).toEqual([]);
    expect(body.phases[0].savedGroupTargeting).toEqual([]);
  });

  it("rejects when status is stopped", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () =>
      makeResponse({
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
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.5,
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("stopped");
  });

  it("rejects when no targeting fields provided", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("No targeting fields");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates trafficSplit (weights must sum to 1)", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () =>
      makeResponse({
        ok: true,
        status: 200,
        json: makeRunningExperimentJson(),
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v0", weight: 0.3 },
        { variationId: "v1", weight: 0.3 },
      ],
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("Invalid trafficSplit");
  });

  it("round-trips targetingCondition into the new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeRunningExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const condition = '{"country":{"$in":["US","CA"]}}';
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: condition,
      phaseName: "Geo expansion",
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.targetingCondition).toBe(condition);
    expect(newPhase.name).toBe("Geo expansion");
  });

  it("rejects malformed targetingCondition JSON via Zod before any HTTP call", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const schema = tool!.config.inputSchema;
    const result = schema.safeParse({
      experimentId: "exp_1",
      targetingCondition: "{not valid json",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("valid JSON");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed prerequisites[].condition JSON via Zod", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const schema = tool!.config.inputSchema;
    const result = schema.safeParse({
      experimentId: "exp_1",
      prerequisites: [{ id: "prereq_1", condition: "not json" }],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("valid JSON");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("converts a GET phase with reasonForStopping into POST shape with reason", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const json = {
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
          {
            name: "Phase 1",
            dateStarted: "2026-01-01T00:00:00Z",
            dateEnded: "2026-02-01T00:00:00Z",
            reasonForStopping: "old reason",
            coverage: 0.8,
            trafficSplit: [
              { variationId: "v0", weight: 0.5 },
              { variationId: "v1", weight: 0.5 },
            ],
            targetingCondition: '{"region":"NA"}',
            seed: "seed-abc",
          },
          {
            name: "Phase 2",
            dateStarted: "2026-02-01T00:00:00Z",
            coverage: 1,
            trafficSplit: [
              { variationId: "v0", weight: 0.5 },
              { variationId: "v1", weight: 0.5 },
            ],
            targetingCondition: '{"region":"EU"}',
          },
        ],
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
    const fetchSpy = makeFetchSpy(calls, json);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.6,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);

    expect(body.phases).toHaveLength(3);

    expect(body.phases[0].reason).toBe("old reason");
    expect(body.phases[0].reasonForStopping).toBeUndefined();
    expect(body.phases[0].dateEnded).toBe("2026-02-01T00:00:00Z");
    expect(body.phases[0].seed).toBe("seed-abc");
    expect(body.phases[0].targetingCondition).toBe('{"region":"NA"}');

    expect(body.phases[1].dateEnded).toBeTruthy();
    expect(body.phases[1].targetingCondition).toBe('{"region":"EU"}');

    expect(body.phases[2].coverage).toBe(0.6);
    expect(body.phases[2].targetingCondition).toBe('{"region":"EU"}');
    expect(body.phases[2].reason).toBeUndefined();
    expect(body.phases[2].reasonForStopping).toBeUndefined();
    expect(body.phases[2].dateEnded).toBeUndefined();
  });

  it("sends both condition and targetingCondition on the new phase (server reads condition)", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeRunningExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"x":1}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.condition).toBe('{"x":1}');
    expect(newPhase.targetingCondition).toBe('{"x":1}');
  });

  it("converts trafficSplit input to variationWeights on the new phase (server ignores trafficSplit)", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeRunningExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v0", weight: 0.7 },
        { variationId: "v1", weight: 0.3 },
      ],
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.variationWeights).toEqual([0.7, 0.3]);
    expect(newPhase.trafficSplit).toBeUndefined();
    const previousPhase = body.phases[body.phases.length - 2];
    expect(previousPhase.variationWeights).toEqual([0.5, 0.5]);
    expect(previousPhase.trafficSplit).toBeUndefined();
  });

  it("converts a GET phase with variationWeights to variationWeights on POST", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const json = {
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
          {
            name: "Phase 1",
            dateStarted: "2026-03-01T00:00:00Z",
            coverage: 1,
            variationWeights: [0.4, 0.6],
            targetingCondition: '{"x":1}',
          },
        ],
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
    const fetchSpy = makeFetchSpy(calls, json);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({ experimentId: "exp_1", coverage: 0.9 });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.variationWeights).toEqual([0.4, 0.6]);
    expect(newPhase.trafficSplit).toBeUndefined();
  });

  it("namespace=null (patchCurrent) clears existing namespace on the patched phase and never sends namespace:null", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const json = makeRunningExperimentJson([
      {
        name: "Phase 1",
        dateStarted: "2026-03-01T00:00:00Z",
        coverage: 1,
        variationWeights: [0.5, 0.5],
        targetingCondition: '{"x":1}',
        namespace: { namespaceId: "ns_a", range: [0, 0.5] },
      },
    ]);
    const fetchSpy = makeFetchSpy(calls, json);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      mode: "patchCurrent",
      namespace: null,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(1);
    expect(
      Object.prototype.hasOwnProperty.call(body.phases[0], "namespace"),
    ).toBe(false);
    expect(postCall!.body!).not.toContain('"namespace":null');
  });

  it("namespace=null (newPhase) clears namespace on the new phase only", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const json = makeRunningExperimentJson([
      {
        name: "Phase 1",
        dateStarted: "2026-03-01T00:00:00Z",
        coverage: 1,
        variationWeights: [0.5, 0.5],
        targetingCondition: '{"x":1}',
        namespace: { namespaceId: "ns_a", range: [0, 0.5] },
      },
    ]);
    const fetchSpy = makeFetchSpy(calls, json);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      namespace: null,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0].namespace).toEqual({
      namespaceId: "ns_a",
      range: [0, 0.5],
    });
    expect(
      Object.prototype.hasOwnProperty.call(body.phases[1], "namespace"),
    ).toBe(false);
    expect(postCall!.body!).not.toContain('"namespace":null');
  });

  it("namespace omitted preserves existing namespace from lastPhase on the new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const json = makeRunningExperimentJson([
      {
        name: "Phase 1",
        dateStarted: "2026-03-01T00:00:00Z",
        coverage: 1,
        variationWeights: [0.5, 0.5],
        targetingCondition: '{"x":1}',
        namespace: { namespaceId: "ns_a", range: [0, 0.5] },
      },
    ]);
    const fetchSpy = makeFetchSpy(calls, json);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.4,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases[1].namespace).toEqual({
      namespaceId: "ns_a",
      range: [0, 0.5],
    });
  });

  it("namespace=object sets it on the new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeRunningExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      namespace: { namespaceId: "x", range: [0, 0.5] },
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.namespace).toEqual({ namespaceId: "x", range: [0, 0.5] });
  });

  it("seeds Phase 1 on a draft with no existing phases (targetingCondition only, equal split, no status field)", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const draftJson = {
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
    };
    const fetchSpy = makeFetchSpy(calls, draftJson);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"utm_source":"google"}',
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("draft");

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);

    // Must NOT include status — experiment stays a draft.
    expect(body.status).toBeUndefined();
    // Body has phases as the only field.
    expect(Object.keys(body)).toEqual(["phases"]);

    expect(body.phases).toHaveLength(1);
    const phase = body.phases[0];
    expect(phase.name).toBe("Phase 1");
    // POST schema requires phases[].dateStarted — must be a valid ISO string
    // even though the draft hasn't actually launched. Status-aware rendering
    // in formatExperimentDetail makes the draft read as "not yet launched".
    expect(typeof phase.dateStarted).toBe("string");
    expect(phase.dateStarted).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(phase.dateEnded).toBeUndefined();
    expect(phase.coverage).toBe(1);
    expect(phase.condition).toBe('{"utm_source":"google"}');
    expect(phase.targetingCondition).toBe('{"utm_source":"google"}');
    // Equal-split default across 2 variations.
    expect(phase.variationWeights).toEqual([0.5, 0.5]);
    expect(phase.trafficSplit).toBeUndefined();
    expect(phase.prerequisites).toEqual([]);
    expect(phase.savedGroupTargeting).toEqual([]);
  });

  it("draft + existing phases forces patchCurrent semantics even when mode='newPhase' is passed", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const draftWithPhaseJson = {
      experiment: {
        id: "exp_1",
        name: "Test",
        status: "draft",
        type: "standard",
        variations: [
          { variationId: "v0", key: "0", name: "Control" },
          { variationId: "v1", key: "1", name: "Treatment" },
        ],
        phases: [
          {
            name: "Phase 1",
            dateStarted: "2026-03-01T00:00:00Z",
            coverage: 1,
            variationWeights: [0.5, 0.5],
            targetingCondition: '{"utm_source":"facebook"}',
          },
        ],
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
    const fetchSpy = makeFetchSpy(calls, draftWithPhaseJson);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      mode: "newPhase",
      targetingCondition: '{"utm_source":"google"}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);

    // Must NOT include status — experiment stays a draft.
    expect(body.status).toBeUndefined();
    // Despite mode='newPhase', draft is patched in place — only one phase.
    expect(body.phases).toHaveLength(1);
    expect(body.phases[0].dateStarted).toBe("2026-03-01T00:00:00Z");
    expect(body.phases[0].dateEnded).toBeUndefined();
    expect(body.phases[0].targetingCondition).toBe('{"utm_source":"google"}');
    expect(body.phases[0].condition).toBe('{"utm_source":"google"}');
  });

  it("seeds Phase 1 on draft honoring coverage, trafficSplit, and phaseName overrides", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const draftJson = {
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
    };
    const fetchSpy = makeFetchSpy(calls, draftJson);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.8,
      trafficSplit: [
        { variationId: "v0", weight: 0.3 },
        { variationId: "v1", weight: 0.7 },
      ],
      phaseName: "SEM rollout",
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBeUndefined();
    expect(body.phases).toHaveLength(1);
    const phase = body.phases[0];
    expect(phase.name).toBe("SEM rollout");
    expect(phase.coverage).toBe(0.8);
    expect(phase.variationWeights).toEqual([0.3, 0.7]);
    expect(phase.condition).toBe("{}");
    expect(phase.targetingCondition).toBe("{}");
  });

  it("rejects archived experiments even when status is 'draft' (archived flag is independent of status)", async () => {
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
            status: "draft",
            archived: true,
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
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

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.5,
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("archived");
    expect(res.content[0].text).toContain("archive_experiment");

    // Only the GET should have happened — no mutation.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
  });

  it("rejects archived experiments even when status is 'stopped' (archived check runs before status check)", async () => {
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
            status: "stopped",
            archived: true,
            variations: [
              { variationId: "v0", key: "0", name: "Control" },
              { variationId: "v1", key: "1", name: "Treatment" },
            ],
            phases: [
              {
                name: "Phase 1",
                dateStarted: "2026-01-01T00:00:00Z",
                dateEnded: "2026-02-01T00:00:00Z",
                coverage: 1,
                variationWeights: [0.5, 0.5],
                condition: "{}",
              },
            ],
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

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.5,
    });
    await vi.runAllTimersAsync();
    const res = await p;

    // Should say "archived" / point to archive_experiment, NOT "resume_experiment".
    expect(res.content[0].text).toContain("archived");
    expect(res.content[0].text).toContain("archive_experiment");
    expect(res.content[0].text).not.toContain("resume_experiment");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
  });

  it("drops stale variationWeights on a seeded draft patchCurrent when variation count changed", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const draftWithStaleWeightsJson = {
      experiment: {
        id: "exp_1",
        name: "Test",
        status: "draft",
        type: "standard",
        // 3 variations now, but the seeded phase only has 2 weights.
        variations: [
          { variationId: "v0", key: "0", name: "Control" },
          { variationId: "v1", key: "1", name: "B" },
          { variationId: "v2", key: "2", name: "C" },
        ],
        phases: [
          {
            name: "Phase 1",
            dateStarted: "2026-03-01T00:00:00Z",
            coverage: 0.8,
            variationWeights: [0.5, 0.5],
            condition: '{"utm_source":"facebook"}',
            targetingCondition: '{"utm_source":"facebook"}',
            savedGroupTargeting: [{ matchType: "all", savedGroups: ["sg_1"] }],
          },
        ],
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
    const fetchSpy = makeFetchSpy(calls, draftWithStaleWeightsJson);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"utm_source":"google"}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(1);
    const phase = body.phases[0];
    // Stale 2-element weights replaced by equal third-split.
    expect(phase.variationWeights).toHaveLength(3);
    expect(phase.variationWeights[0]).toBeCloseTo(1 / 3, 10);
    expect(phase.variationWeights[1]).toBeCloseTo(1 / 3, 10);
    expect(phase.variationWeights[2]).toBeCloseTo(1 / 3, 10);
    // Other preserved fields survive.
    expect(phase.condition).toBe('{"utm_source":"google"}');
    expect(phase.targetingCondition).toBe('{"utm_source":"google"}');
    expect(phase.savedGroupTargeting).toEqual([
      { matchType: "all", savedGroups: ["sg_1"] },
    ]);
    expect(phase.coverage).toBe(0.8);
  });

  it("draft patchCurrent realigns seeded weights by variationId when variations have been reordered since seeding", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const draftReorderedJson = {
      experiment: {
        id: "exp_1",
        name: "Test",
        status: "draft",
        type: "standard",
        // Variations have been reordered since seeding: was [v0, v1] when the
        // phase was seeded (with v0=0.3, v1=0.7); now [v1, v0].
        variations: [
          { variationId: "v1", key: "1", name: "B" },
          { variationId: "v0", key: "0", name: "Control" },
        ],
        phases: [
          {
            name: "Phase 1",
            dateStarted: "2026-03-01T00:00:00Z",
            coverage: 0.8,
            // Source phase carries trafficSplit IDs (seeded via UI).
            trafficSplit: [
              { variationId: "v0", weight: 0.3 },
              { variationId: "v1", weight: 0.7 },
            ],
            // Positional variationWeights are stale relative to the new order.
            variationWeights: [0.3, 0.7],
            condition: '{"utm_source":"facebook"}',
            targetingCondition: '{"utm_source":"facebook"}',
          },
        ],
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
    const fetchSpy = makeFetchSpy(calls, draftReorderedJson);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    // Coverage/condition-only patch — no trafficSplit override.
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"utm_source":"google"}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(1);
    const phase = body.phases[0];
    // Weights must be reordered by variationId to match [v1, v0]: 0.7, 0.3.
    // Without ID-based realignment, this would post [0.3, 0.7] — applying v0's
    // weight to v1 and vice versa.
    expect(phase.variationWeights).toEqual([0.7, 0.3]);
    expect(phase.targetingCondition).toBe('{"utm_source":"google"}');
  });

  it("rejects draft patchCurrent when variations were cleared (would post weights for non-existent variations)", async () => {
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
            status: "draft",
            archived: false,
            variations: [], // variations cleared after seed
            phases: [
              {
                name: "Phase 1",
                dateStarted: "2026-03-01T00:00:00Z",
                coverage: 1,
                variationWeights: [0.5, 0.5],
                condition: '{"utm_source":"google"}',
              },
            ],
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

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"utm_source":"facebook"}',
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("no variations");
    expect(res.content[0].text).toContain("update_experiment");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
  });

  it("renders draft patchCurrent confirmation with draft status + launch hint (not as a running update)", async () => {
    const { formatExperimentTargetingUpdated } =
      await import("../../src/format-responses.js");
    const rendered = formatExperimentTargetingUpdated(
      {
        experiment: {
          id: "exp_1",
          name: "SEM Non-Brand",
          status: "draft",
          type: "standard",
          variations: [
            { variationId: "v0", key: "0", name: "Control" },
            { variationId: "v1", key: "1", name: "Treatment" },
          ],
          phases: [
            {
              name: "Phase 1",
              dateStarted: "2026-03-01T00:00:00Z",
              coverage: 1,
              variationWeights: [0.5, 0.5],
              condition: '{"utm_source":"google"}',
              targetingCondition: '{"utm_source":"google"}',
            },
          ],
          settings: { goals: [], guardrails: [], secondaryMetrics: [] },
        },
      } as any,
      "https://app.growthbook.io",
      "patchCurrent",
    );
    expect(rendered).toContain("draft");
    expect(rendered).toMatch(/start_experiment|launch/i);
    expect(rendered).not.toContain("Patched current phase in place");
  });

  it("renders seeded draft phase as 'not yet launched' regardless of dateStarted (status-aware)", async () => {
    const { formatExperimentDetail } =
      await import("../../src/format-responses.js");
    const rendered = formatExperimentDetail(
      {
        experiment: {
          id: "exp_1",
          name: "SEM Non-Brand",
          status: "draft",
          type: "standard",
          variations: [
            { variationId: "v0", key: "0", name: "Control" },
            { variationId: "v1", key: "1", name: "Treatment" },
          ],
          phases: [
            {
              name: "Phase 1",
              dateStarted: "2026-03-01T00:00:00Z",
              coverage: 1,
              variationWeights: [0.5, 0.5],
              condition: '{"utm_source":"google"}',
              targetingCondition: '{"utm_source":"google"}',
            },
          ],
          settings: { goals: [], guardrails: [], secondaryMetrics: [] },
        },
      } as any,
      "https://app.example.com",
    );

    expect(rendered).toContain("not yet launched");
    expect(rendered).not.toContain("ongoing");
    // Confirm we did not render the raw dateStarted in the phase line.
    expect(rendered).not.toContain("2026-03-01T00:00:00Z → ongoing");
  });
});

describe("resume_experiment", () => {
  function makeStoppedExperimentJson(
    phases: any[] = [
      {
        name: "Phase 1",
        dateStarted: "2026-03-01T00:00:00Z",
        dateEnded: "2026-03-05T00:00:00Z",
        reasonForStopping: "Initial run",
        coverage: 0.8,
        trafficSplit: [
          { variationId: "v0", weight: 0.5 },
          { variationId: "v1", weight: 0.5 },
        ],
        targetingCondition: '{"country":"US"}',
      },
      {
        name: "Phase 2",
        dateStarted: "2026-03-05T00:00:00Z",
        dateEnded: "2026-03-10T00:00:00Z",
        reasonForStopping: "Treatment won",
        coverage: 1,
        trafficSplit: [
          { variationId: "v0", weight: 0.5 },
          { variationId: "v1", weight: 0.5 },
        ],
        targetingCondition: '{"country":"CA"}',
      },
    ],
  ) {
    return {
      experiment: {
        id: "exp_1",
        name: "Test",
        status: "stopped",
        type: "standard",
        variations: [
          { variationId: "v0", key: "0", name: "Control" },
          { variationId: "v1", key: "1", name: "Treatment" },
        ],
        phases,
        settings: { goals: [], guardrails: [], secondaryMetrics: [] },
      },
    };
  }

  function makeFetchSpy(
    calls: Array<{ url: string; method?: string; body?: string }>,
    initialJson: any,
  ) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      if (!init?.method || init.method === "GET") {
        return makeResponse({ ok: true, status: 200, json: initialJson });
      }
      return makeResponse({ ok: true, status: 200, json: initialJson });
    });
  }

  it("is registered with readOnlyHint: false", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(false);
    expect(tool!.config.annotations.destructiveHint).toBe(false);
    expect(tool!.config.annotations.idempotentHint).toBeUndefined();
  });

  it("sets status to running, converts existing phases, appends auto-named new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeStoppedExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const before = new Date().toISOString();
    const p = tool!.handler({ experimentId: "exp_1" });
    await vi.runAllTimersAsync();
    const res = await p;
    const after = new Date().toISOString();

    expect(res.content[0].text).toContain("resumed");

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);
    expect(body.status).toBe("running");
    expect(body.phases).toHaveLength(3);

    expect(body.phases[0].reason).toBe("Initial run");
    expect(body.phases[0].reasonForStopping).toBeUndefined();
    expect(body.phases[0].dateEnded).toBe("2026-03-05T00:00:00Z");
    expect(body.phases[0].targetingCondition).toBe('{"country":"US"}');

    expect(body.phases[1].reason).toBe("Treatment won");
    expect(body.phases[1].reasonForStopping).toBeUndefined();
    expect(body.phases[1].dateEnded).toBe("2026-03-10T00:00:00Z");
    expect(body.phases[1].targetingCondition).toBe('{"country":"CA"}');

    expect(body.phases[2].name).toBe("Phase 3");
    expect(body.phases[2].dateStarted >= before).toBe(true);
    expect(body.phases[2].dateStarted <= after).toBe(true);
    expect(body.phases[2].dateEnded).toBeUndefined();
    expect(body.phases[2].reason).toBeUndefined();
    expect(body.phases[2].reasonForStopping).toBeUndefined();
    expect(body.phases[2].targetingCondition).toBe('{"country":"CA"}');
    expect(body.phases[2].condition).toBe('{"country":"CA"}');
    expect(body.phases[2].variationWeights).toEqual([0.5, 0.5]);
    expect(body.phases[2].trafficSplit).toBeUndefined();
  });

  it("applies targetingCondition override only to the new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeStoppedExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const newCondition = '{"plan":"pro"}';
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: newCondition,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(3);
    expect(body.phases[0].targetingCondition).toBe('{"country":"US"}');
    expect(body.phases[1].targetingCondition).toBe('{"country":"CA"}');
    expect(body.phases[2].targetingCondition).toBe(newCondition);
  });

  it("honors a custom phaseName", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeStoppedExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      phaseName: "Relaunch with refined audience",
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases[body.phases.length - 1].name).toBe(
      "Relaunch with refined audience",
    );
  });

  it("rejects when status is running", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () =>
      makeResponse({
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
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({ experimentId: "exp_1" }).catch((e: any) => e);
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res).not.toBeInstanceOf(Error);
    expect(res.content[0].text).toContain("already running");
    expect(res.content[0].text).toContain("update_experiment_targeting");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects when status is draft", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () =>
      makeResponse({
        ok: true,
        status: 200,
        json: {
          experiment: {
            id: "exp_1",
            status: "draft",
            variations: [],
            phases: [],
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({ experimentId: "exp_1" }).catch((e: any) => e);
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res).not.toBeInstanceOf(Error);
    expect(res.content[0].text).toContain("never launched");
    expect(res.content[0].text).toContain("start_experiment");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("validates trafficSplit (weights must sum to 1)", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () =>
      makeResponse({
        ok: true,
        status: 200,
        json: makeStoppedExperimentJson(),
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v0", weight: 0.3 },
        { variationId: "v1", weight: 0.3 },
      ],
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("Invalid trafficSplit");
  });

  it("rejects malformed targetingCondition JSON via Zod before any HTTP call", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const schema = tool!.config.inputSchema;
    const result = schema.safeParse({
      experimentId: "exp_1",
      targetingCondition: "{not valid json",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("valid JSON");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends both condition and targetingCondition on the new phase (server reads condition)", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeStoppedExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      targetingCondition: '{"x":1}',
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.condition).toBe('{"x":1}');
    expect(newPhase.targetingCondition).toBe('{"x":1}');
  });

  it("converts trafficSplit input to variationWeights on the new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeStoppedExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      trafficSplit: [
        { variationId: "v0", weight: 0.7 },
        { variationId: "v1", weight: 0.3 },
      ],
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.variationWeights).toEqual([0.7, 0.3]);
    expect(newPhase.trafficSplit).toBeUndefined();
  });

  it("namespace=null clears namespace on the new phase and never sends namespace:null", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const json = makeStoppedExperimentJson([
      {
        name: "Phase 1",
        dateStarted: "2026-03-01T00:00:00Z",
        dateEnded: "2026-03-05T00:00:00Z",
        coverage: 1,
        variationWeights: [0.5, 0.5],
        targetingCondition: '{"x":1}',
        namespace: { namespaceId: "ns_a", range: [0, 0.5] },
      },
    ]);
    const fetchSpy = makeFetchSpy(calls, json);
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      namespace: null,
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.phases).toHaveLength(2);
    expect(body.phases[0].namespace).toEqual({
      namespaceId: "ns_a",
      range: [0, 0.5],
    });
    expect(
      Object.prototype.hasOwnProperty.call(body.phases[1], "namespace"),
    ).toBe(false);
    expect(postCall!.body!).not.toContain('"namespace":null');
  });

  it("namespace=object sets it on the new phase", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = makeFetchSpy(calls, makeStoppedExperimentJson());
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    registerExperimentTools(baseArgs);

    const tool = tools.find((t) => t.name === "resume_experiment");
    const p = tool!.handler({
      experimentId: "exp_1",
      namespace: { namespaceId: "x", range: [0, 0.5] },
    });
    await vi.runAllTimersAsync();
    await p;

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    const newPhase = body.phases[body.phases.length - 1];
    expect(newPhase.namespace).toEqual({ namespaceId: "x", range: [0, 0.5] });
  });
});

describe("refresh_experiment_results", () => {
  it("creates snapshot and returns success when complete", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      callCount++;
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
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

  it("passes dimension and phase as query params to results endpoint", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
      if (url.includes("/snapshots/")) {
        return makeResponse({
          ok: true,
          status: 200,
          json: { snapshot: { id: "snap_1", status: "success" } },
        });
      }
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
    const p = tool!.handler({
      experimentId: "exp_1",
      dimension: "dim_abc",
      phase: "1",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("refreshed");
    expect(res.content[0].text).toContain("dim_abc");

    const resultsCall = fetchSpy.mock.calls.find(
      ([url]: [string]) => typeof url === "string" && url.includes("/results"),
    );
    expect(resultsCall).toBeTruthy();
    const resultsUrl = resultsCall![0] as string;
    expect(resultsUrl).toContain("dimension=dim_abc");
    expect(resultsUrl).toContain("phase=1");
  });

  it("passes dimension-only without phase in query params", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
      if (url.includes("/snapshots/")) {
        return makeResponse({
          ok: true,
          status: 200,
          json: { snapshot: { id: "snap_1", status: "success" } },
        });
      }
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
    const p = tool!.handler({ experimentId: "exp_1", dimension: "dim_abc" });
    await vi.runAllTimersAsync();
    const res = await p;

    const resultsCall = fetchSpy.mock.calls.find(
      ([url]: [string]) => typeof url === "string" && url.includes("/results"),
    );
    const resultsUrl = resultsCall![0] as string;
    expect(resultsUrl).toContain("dimension=dim_abc");
    expect(resultsUrl).not.toContain("phase=");
  });

  it("omits JSON block when resultsData.result is null", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
      if (url.includes("/snapshots/")) {
        return makeResponse({
          ok: true,
          status: 200,
          json: { snapshot: { id: "snap_1", status: "success" } },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: { result: null },
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

    expect(res.content).toHaveLength(1);
    expect(res.content[0].text).toContain("refreshed");
  });

  it("returns error status when snapshot fails", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
      return makeResponse({
        ok: true,
        status: 200,
        json: { snapshot: { id: "snap_1", status: "error" } },
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

    expect(res.content[0].text).toContain("Error");
    expect(res.content[0].text).toContain("exp_1");
  });

  it("returns timeout when snapshot stays running", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return makeResponse({
          ok: true,
          status: 200,
          json: {
            snapshot: { id: "snap_1", experiment: "exp_1", status: "running" },
          },
        });
      }
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
