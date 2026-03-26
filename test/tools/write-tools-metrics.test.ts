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
    const body = JSON.parse(postCall!.body!);
    expect(body).toEqual({ name: "Updated Name" });
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

describe("create_fact_table", () => {
  it("sends payload and returns formatted result", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factTable: {
            id: "ftb_abc",
            name: "Event Stream",
            datasource: "ds_123",
            sql: "SELECT * FROM events",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "create_fact_table");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(false);
    expect(tool!.config.annotations.destructiveHint).toBe(false);

    const p = tool!.handler({
      name: "Event Stream",
      datasource: "ds_123",
      userIdTypes: ["user_id"],
      sql: "SELECT * FROM events",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("created");
    expect(res.content[0].text).toContain("Event Stream");

    const postCall = calls.find((c) => c.url.includes("fact-tables"));
    expect(postCall).toBeTruthy();
    expect(postCall!.method).toBe("POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.name).toBe("Event Stream");
    expect(body.datasource).toBe("ds_123");
    expect(body.userIdTypes).toEqual(["user_id"]);
    expect(body.sql).toBe("SELECT * FROM events");
  });
});

describe("update_fact_table", () => {
  it("sends only changed fields", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factTable: {
            id: "ftb_abc",
            name: "Updated Name",
            datasource: "ds_123",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "update_fact_table");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(false);

    const p = tool!.handler({
      factTableId: "ftb_abc",
      name: "Updated Name",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("updated");
    const postCall = calls.find((c) => c.url.includes("ftb_abc"));
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);
    expect(body).toEqual({ name: "Updated Name" });
  });
});

describe("delete_fact_table", () => {
  it("sends DELETE request and returns confirmation", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return makeResponse({
        ok: true,
        status: 200,
        json: { deletedId: "ftb_abc" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "delete_fact_table");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(true);

    const p = tool!.handler({ factTableId: "ftb_abc" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("deleted");
    expect(res.content[0].text).toContain("ftb_abc");
    const deleteCall = calls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.url).toContain("ftb_abc");
  });
});

describe("delete_fact_metric", () => {
  it("sends DELETE request and returns confirmation", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return makeResponse({
        ok: true,
        status: 200,
        json: { deletedId: "fact__conv" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "delete_fact_metric");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(true);

    const p = tool!.handler({ metricId: "fact__conv" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("deleted");
    expect(res.content[0].text).toContain("fact__conv");
    const deleteCall = calls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.url).toContain("fact__conv");
  });
});

describe("list_fact_table_filters", () => {
  it("returns formatted filter list", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factTableFilters: [
            {
              id: "flt_abc",
              name: "Purchase Events",
              value: "event_name = 'purchase'",
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

    const tool = tools.find((t) => t.name === "list_fact_table_filters");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(true);

    const p = tool!.handler({ factTableId: "ftb_abc", limit: 100, offset: 0 });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("Purchase Events");
    expect(res.content[0].text).toContain("flt_abc");
  });
});

describe("create_fact_table_filter", () => {
  it("sends filter payload and returns formatted result", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          factTableFilter: {
            id: "flt_abc",
            name: "Purchase Events",
            value: "event_name = 'purchase'",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "create_fact_table_filter");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(false);

    const p = tool!.handler({
      factTableId: "ftb_abc",
      name: "Purchase Events",
      value: "event_name = 'purchase'",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("created");
    expect(res.content[0].text).toContain("Purchase Events");

    const postCall = calls.find((c) => c.url.includes("filters"));
    expect(postCall).toBeTruthy();
    expect(postCall!.method).toBe("POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.name).toBe("Purchase Events");
    expect(body.value).toBe("event_name = 'purchase'");
  });
});

describe("delete_fact_table_filter", () => {
  it("sends DELETE request and returns confirmation", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return makeResponse({
        ok: true,
        status: 200,
        json: { deletedId: "flt_abc" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerMetricsTools } = await import("../../src/tools/metrics.js");
    registerMetricsTools(baseArgs);

    const tool = tools.find((t) => t.name === "delete_fact_table_filter");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(true);

    const p = tool!.handler({ factTableId: "ftb_abc", filterId: "flt_abc" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("deleted");
    expect(res.content[0].text).toContain("flt_abc");
    const deleteCall = calls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.url).toContain("flt_abc");
  });
});
