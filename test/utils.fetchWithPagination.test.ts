import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithPagination } from "../src/utils.js";

function makeJsonResponse(body: any): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    path: u.pathname,
    limit: u.searchParams.get("limit"),
    offset: u.searchParams.get("offset"),
  };
}

describe("fetchWithPagination", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("mostRecent=false: passes provided offset and limit, no reversal", async () => {
    const items = [1, 2, 3, 4, 5];
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        makeJsonResponse({ items, total: 100, limit: 5, offset: 10 }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      5,
      10,
      false,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = parseUrl(fetchSpy.mock.calls[0][0]);
    expect(call.path).toBe("/api/v1/items");
    expect(call.limit).toBe("5");
    expect(call.offset).toBe("10");
    expect(result.items).toEqual([1, 2, 3, 4, 5]);
  });

  it("mostRecent=true, offset=0: fetches last API page and reverses", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 100, items: [] }))
      .mockResolvedValueOnce(
        makeJsonResponse({ items: [91, 92, 93, 94, 95, 96, 97, 98, 99, 100] }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      10,
      0,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const first = parseUrl(fetchSpy.mock.calls[0][0]);
    expect(first.limit).toBe("1");
    const second = parseUrl(fetchSpy.mock.calls[1][0]);
    expect(second.limit).toBe("10");
    expect(second.offset).toBe("90");
    expect(result.items).toEqual([100, 99, 98, 97, 96, 95, 94, 93, 92, 91]);
  });

  it("mostRecent=true, offset=10: fetches API page at total-limit-offset and reverses", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 100, items: [] }))
      .mockResolvedValueOnce(
        makeJsonResponse({ items: [81, 82, 83, 84, 85, 86, 87, 88, 89, 90] }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      10,
      10,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const second = parseUrl(fetchSpy.mock.calls[1][0]);
    expect(second.limit).toBe("10");
    expect(second.offset).toBe("80");
    expect(result.items).toEqual([90, 89, 88, 87, 86, 85, 84, 83, 82, 81]);
  });

  it("mostRecent=true, offset > total: returns empty page without data fetch", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 5, items: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      10,
      100,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(5);
  });

  it("mostRecent=true: appends additionalParams to count and data requests", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 20, items: [] }))
      .mockResolvedValueOnce(makeJsonResponse({ items: [11, 12, 13, 14, 15] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      5,
      0,
      true,
      { projectId: "prj_1" },
    );
    await vi.runAllTimersAsync();
    const result = await p;

    const first = new URL(fetchSpy.mock.calls[0][0]);
    expect(first.searchParams.get("projectId")).toBe("prj_1");
    expect(first.searchParams.get("limit")).toBe("1");
    const second = new URL(fetchSpy.mock.calls[1][0]);
    expect(second.searchParams.get("projectId")).toBe("prj_1");
    expect(second.searchParams.get("offset")).toBe("15");
    expect(result.items).toEqual([15, 14, 13, 12, 11]);
  });

  it("mostRecent=true: count request uses filtered total from additionalParams", async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      const projectId = u.searchParams.get("projectId");
      const limitParam = u.searchParams.get("limit");

      if (limitParam === "1") {
        if (projectId === "p1") {
          return makeJsonResponse({ total: 12, items: [] });
        }
        return makeJsonResponse({ total: 500, items: [] });
      }

      return makeJsonResponse({ items: [1, 2, 3, 4, 5] });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      5,
      0,
      true,
      { projectId: "p1" },
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const first = new URL(fetchSpy.mock.calls[0][0]);
    expect(first.searchParams.get("projectId")).toBe("p1");
    expect(first.searchParams.get("limit")).toBe("1");

    const second = new URL(fetchSpy.mock.calls[1][0]);
    expect(second.searchParams.get("projectId")).toBe("p1");
    expect(second.searchParams.get("limit")).toBe("5");
    expect(second.searchParams.get("offset")).toBe("7");
    expect(result.items).toEqual([5, 4, 3, 2, 1]);
  });

  it("mostRecent=true, last partial page: shrinks limit to remaining rows", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 95, items: [] }))
      .mockResolvedValueOnce(makeJsonResponse({ items: [1, 2, 3, 4, 5] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      10,
      90,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const second = parseUrl(fetchSpy.mock.calls[1][0]);
    expect(second.limit).toBe("5");
    expect(second.offset).toBe("0");
    expect(result.items).toEqual([5, 4, 3, 2, 1]);
  });

  it("mostRecent=true, offset === total: returns empty without data fetch", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 95, items: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      10,
      95,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(95);
  });

  it("mostRecent=true, total === limit: fetches full dataset and reverses", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ total: 10, items: [] }))
      .mockResolvedValueOnce(
        makeJsonResponse({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      10,
      0,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const second = parseUrl(fetchSpy.mock.calls[1][0]);
    expect(second.limit).toBe("10");
    expect(second.offset).toBe("0");
    expect(result.items).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("mostRecent=false: passes additionalParams without count call", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ items: [1, 2, 3] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      5,
      0,
      false,
      { projectId: "prj_1" },
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = new URL(fetchSpy.mock.calls[0][0]);
    expect(call.searchParams.get("projectId")).toBe("prj_1");
    expect(result.items).toEqual([1, 2, 3]);
  });
});
