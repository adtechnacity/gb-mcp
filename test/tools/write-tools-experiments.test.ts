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
