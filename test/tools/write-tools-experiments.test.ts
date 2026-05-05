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
    expect(body.phases[0].trafficSplit).toHaveLength(2);
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

    const tool = tools.find((t) => t.name === "update_experiment_targeting");
    const p = tool!.handler({
      experimentId: "exp_1",
      coverage: 0.5,
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("draft");
    expect(res.content[0].text).toContain("running");
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
