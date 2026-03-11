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

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall!.body!);
    expect(body.description).toBe("Updated");
    expect(body.defaultValue).toBe("true");
    expect(body.valueType).toBeUndefined();
  });
});

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

describe("add_feature_rule", () => {
  it("appends a force rule to a specific environment only", async () => {
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

    const postCall = calls.find((c) => c.method === "POST");
    const body = JSON.parse(postCall!.body!);
    expect(body.environments.production.rules).toHaveLength(2);
    expect(body.environments.staging.rules).toHaveLength(0);
  });
});

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
