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

function makeResponse(json: any) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    headers: new Headers(),
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as any as Response;
}

const baseArgs = {
  server: null as any,
  baseApiUrl: "https://api.example.com",
  apiKey: "key",
  appOrigin: "https://app.example.com",
  user: "u@example.com",
};

describe("get_experiments summary mode pagination echo", () => {
  it("mostRecent=true, offset=0: echoes caller coordinates, not raw API coordinates", async () => {
    vi.useFakeTimers();

    const draftExperiments = Array.from({ length: 100 }, (_, i) => ({
      id: `exp_${229 + i}`,
      name: `Experiment ${229 + i}`,
      status: "draft",
    }));

    const fetchSpy = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get("limit") === "1") {
        return makeResponse({
          experiments: [{ id: "exp_1", name: "Experiment 1", status: "draft" }],
          limit: 1,
          offset: 0,
          count: 1,
          total: 328,
          hasMore: true,
          nextOffset: 1,
        });
      }
      return makeResponse({
        experiments: draftExperiments,
        limit: 100,
        offset: 228,
        count: 100,
        total: 328,
        hasMore: false,
        nextOffset: null,
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    vi.doMock("../../src/tools/experiments/experiment-summary.js", () => ({
      handleSummaryMode: vi.fn(async () => ({
        _meta: { totalFetched: 100, excluded: { draft: 100, running: 0 } },
      })),
    }));

    const { registerExperimentTools } =
      await import("../../src/tools/experiments/experiments.js");
    const { server, tools } = makeServerCapture();
    registerExperimentTools({ ...baseArgs, server });

    const tool = tools.find((t) => t.name === "get_experiments");
    expect(tool).toBeDefined();

    const p = tool!.handler(
      { mode: "summary", mostRecent: true, limit: 100, offset: 0 },
      {},
    );
    await vi.runAllTimersAsync();
    const res = await p;

    const dataUrl = new URL(fetchSpy.mock.calls[1][0] as string);
    expect(dataUrl.searchParams.get("offset")).toBe("228");
    expect(dataUrl.searchParams.get("limit")).toBe("100");

    const payload = JSON.parse(res.content[0].text);
    expect(payload.offset).toBe(0);
    expect(payload.limit).toBe(100);
    expect(payload.total).toBe(328);
    expect(payload.hasMore).toBe(true);
    expect(payload.nextOffset).toBe(100);
  });
});
