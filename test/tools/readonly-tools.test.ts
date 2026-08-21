import { describe, expect, it, vi } from "vitest";

type RegisteredTool = {
  name: string;
  handler: (args: any, extra?: any) => Promise<any>;
};

function makeServerCapture() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      _config: any,
      handler: (args: any, extra?: any) => Promise<any>,
    ) => {
      tools.push({ name, handler });
    },
    // Back-compat for older tests / modules (deprecated in SDK)
    tool: (
      name: string,
      _description: string,
      _schema: any,
      _hints: any,
      handler: (args: any, extra?: any) => Promise<any>,
    ) => {
      tools.push({ name, handler });
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

describe("read-only tool handlers (URL + headers)", () => {
  it("get_projects builds limit/offset query params and sets auth header", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        "https://api.example.com/api/v1/projects?limit=10&offset=20",
      );
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer key",
        "Content-Type": "application/json",
      });
      return makeResponse({ ok: true, status: 200, json: { projects: [] } });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerProjectTools } =
      await import("../../src/tools/projects.js");
    registerProjectTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
    });

    const tool = tools.find((t) => t.name === "get_projects");
    expect(tool).toBeTruthy();

    const p = tool!.handler({ limit: 10, offset: 20, mostRecent: false });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.content?.[0]?.type).toBe("text");
  });

  it("get_environments calls /environments with auth header", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.example.com/api/v1/environments");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer key",
        "Content-Type": "application/json",
      });
      return makeResponse({
        ok: true,
        status: 200,
        json: { environments: [] },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerEnvironmentTools } =
      await import("../../src/tools/environments.js");
    registerEnvironmentTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
    });

    const tool = tools.find((t) => t.name === "get_environments");
    const p = tool!.handler({});
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.content?.[0]?.type).toBe("text");
  });

  it("get_metrics calls both /metrics and /fact-metrics with same pagination", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return makeResponse({ ok: true, status: 200, json: { ok: true } });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
      appOrigin: "https://app.example.com",
      user: "u@example.com",
    });

    const tool = tools.find((t) => t.name === "get_metrics");
    const p = tool!.handler({
      limit: 5,
      offset: 15,
      mostRecent: false,
      project: "p1",
    });
    await vi.runAllTimersAsync();
    await p;

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.example.com/api/v1/metrics?limit=5&offset=15&projectId=p1",
      "https://api.example.com/api/v1/fact-metrics?limit=5&offset=15&projectId=p1",
    ]);
    for (const c of calls) {
      expect(c.init?.headers).toMatchObject({
        Authorization: "Bearer key",
        "Content-Type": "application/json",
      });
    }
  });

  it("get_sdk_connections adds projectId when provided", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string) => {
      expect(url).toBe(
        "https://api.example.com/api/v1/sdk-connections?limit=2&offset=0&projectId=p1",
      );
      return makeResponse({ ok: true, status: 200, json: { connections: [] } });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerSdkConnectionTools } =
      await import("../../src/tools/sdk-connections.js");
    registerSdkConnectionTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
    });

    const tool = tools.find((t) => t.name === "get_sdk_connections");
    const p = tool!.handler({
      limit: 2,
      offset: 0,
      mostRecent: false,
      project: "p1",
    });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.content?.[0]?.type).toBe("text");
  });

  it("get_metrics with metricId routes fact__ ids to /fact-metrics and others to /metrics", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetchSpy = vi.fn(async (url: string) => {
      calls.push(url);
      return makeResponse({
        ok: true,
        status: 200,
        json: { name: "m", inverse: false },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
      appOrigin: "https://app.example.com",
      user: "u@example.com",
    });

    const tool = tools.find((t) => t.name === "get_metrics")!;
    const p1 = tool.handler({ metricId: "m1" });
    const p2 = tool.handler({ metricId: "fact__m2" });
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    expect(calls).toContain("https://api.example.com/api/v1/metrics/m1");
    expect(calls).toContain(
      "https://api.example.com/api/v1/fact-metrics/fact__m2",
    );
  });

  it("get_data_sources builds pagination query params and sets auth header", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        "https://api.example.com/api/v1/data-sources?limit=10&offset=0",
      );
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer key",
        "Content-Type": "application/json",
      });
      return makeResponse({ ok: true, status: 200, json: { dataSources: [] } });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerDataSourceTools } =
      await import("../../src/tools/data-sources.js");
    registerDataSourceTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
    });

    const tool = tools.find((t) => t.name === "get_data_sources");
    expect(tool).toBeTruthy();

    const p = tool!.handler({ limit: 10, offset: 0, mostRecent: false });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.content?.[0]?.type).toBe("text");
  });

  it("get_data_sources with dataSourceId fetches the single-resource endpoint", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.example.com/api/v1/data-sources/ds_abc123");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer key",
        "Content-Type": "application/json",
      });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          dataSource: {
            id: "ds_abc123",
            name: "Prod Postgres",
            type: "postgres",
            description: "",
            dateCreated: "2026-01-01T00:00:00Z",
            dateUpdated: "2026-01-02T00:00:00Z",
            projectIds: ["p1"],
            eventTracker: "custom",
            identifierTypes: [{ id: "user_id", description: "" }],
            assignmentQueries: [
              {
                id: "user_id",
                name: "Experiment Exposures",
                description: "",
                identifierType: "user_id",
                sql: "SELECT visitor_id AS user_id FROM experiment_exposures",
                includesNameColumns: false,
                dimensionColumns: [],
              },
            ],
            identifierJoinQueries: [],
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    const { registerDataSourceTools } =
      await import("../../src/tools/data-sources.js");
    registerDataSourceTools({
      server,
      baseApiUrl: "https://api.example.com",
      apiKey: "key",
    });

    const tool = tools.find((t) => t.name === "get_data_sources")!;
    const p = tool.handler({ dataSourceId: "ds_abc123" });
    await vi.runAllTimersAsync();
    const res = await p;
    const text = res.content?.[0]?.text as string;
    expect(text).toContain("Prod Postgres");
    expect(text).toContain("ds_abc123");
    expect(text).toContain("experiment_exposures");
  });
});
