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

describe("list_dimensions", () => {
  it("returns formatted dimension list", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          dimensions: [
            {
              id: "dim_abc",
              name: "Country",
              datasourceId: "ds_123",
              identifierType: "user_id",
              query: "SELECT user_id, country FROM users",
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerDimensionTools } =
      await import("../../src/tools/dimensions.js");
    registerDimensionTools(baseArgs);

    const tool = tools.find((t) => t.name === "list_dimensions");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.readOnlyHint).toBe(true);

    const p = tool!.handler({ limit: 100, offset: 0 });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("Country");
    expect(res.content[0].text).toContain("dim_abc");
  });
});

describe("create_dimension", () => {
  it("sends payload and returns formatted result", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return makeResponse({
        ok: true,
        status: 200,
        json: {
          dimension: {
            id: "dim_abc",
            name: "Country",
            datasourceId: "ds_123",
            identifierType: "user_id",
            query: "SELECT user_id, country FROM users",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerDimensionTools } =
      await import("../../src/tools/dimensions.js");
    registerDimensionTools(baseArgs);

    const tool = tools.find((t) => t.name === "create_dimension");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(false);

    const p = tool!.handler({
      name: "Country",
      datasourceId: "ds_123",
      identifierType: "user_id",
      query: "SELECT user_id, country FROM users",
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("created");
    expect(res.content[0].text).toContain("Country");

    const postCall = calls.find((c) => c.url.includes("dimensions"));
    expect(postCall).toBeTruthy();
    expect(postCall!.method).toBe("POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.name).toBe("Country");
    expect(body.datasourceId).toBe("ds_123");
    expect(body.query).toBe("SELECT user_id, country FROM users");
  });
});

describe("delete_dimension", () => {
  it("sends DELETE request and returns confirmation", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return makeResponse({
        ok: true,
        status: 200,
        json: { deletedId: "dim_abc" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    baseArgs.server = server;
    const { registerDimensionTools } =
      await import("../../src/tools/dimensions.js");
    registerDimensionTools(baseArgs);

    const tool = tools.find((t) => t.name === "delete_dimension");
    expect(tool).toBeTruthy();
    expect(tool!.config.annotations.destructiveHint).toBe(true);

    const p = tool!.handler({ dimensionId: "dim_abc" });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].text).toContain("deleted");
    expect(res.content[0].text).toContain("dim_abc");
    const deleteCall = calls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.url).toContain("dim_abc");
  });
});
