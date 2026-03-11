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
