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

  it("mostRecent=true, offset=0: returns pagination metadata in newest-first coordinates", async () => {
    // API echoes its own (ascending) coordinates; the helper must translate
    // them back to the caller's newest-first space or footer-driven paging
    // stops after one page (hasMore=false on the API's last page).
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse({
          items: [1],
          limit: 1,
          offset: 0,
          count: 1,
          total: 328,
          hasMore: true,
          nextOffset: 1,
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          items: Array.from({ length: 100 }, (_, i) => 229 + i),
          limit: 100,
          offset: 228,
          count: 100,
          total: 328,
          hasMore: false,
          nextOffset: null,
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      100,
      0,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result.offset).toBe(0);
    expect(result.limit).toBe(100);
    expect(result.total).toBe(328);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(100);
    expect(result.items[0]).toBe(328);
  });

  it("mostRecent=true, offset=100: nextOffset advances in newest-first coordinates", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse({
          items: [1],
          limit: 1,
          offset: 0,
          count: 1,
          total: 328,
          hasMore: true,
          nextOffset: 1,
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          items: Array.from({ length: 100 }, (_, i) => 129 + i),
          limit: 100,
          offset: 128,
          count: 100,
          total: 328,
          hasMore: true,
          nextOffset: 228,
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      100,
      100,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result.offset).toBe(100);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(200);
    expect(result.items[0]).toBe(228);
  });

  it("mostRecent=true: feeding nextOffset back walks the full dataset newest-first", async () => {
    const TOTAL = 328;
    const dataset = Array.from({ length: TOTAL }, (_, i) => i + 1);
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit"));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const items = dataset.slice(offset, offset + limit);
      const hasMore = offset + items.length < TOTAL;
      return makeJsonResponse({
        items,
        limit,
        offset,
        count: items.length,
        total: TOTAL,
        hasMore,
        nextOffset: hasMore ? offset + items.length : null,
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const visitedOffsets: number[] = [];
    const collected: number[] = [];
    let offset = 0;
    for (let page = 0; page < 10; page++) {
      visitedOffsets.push(offset);
      const p = fetchWithPagination(
        "https://api.example.com",
        "key",
        "/api/v1/items",
        100,
        offset,
        true,
      );
      await vi.runAllTimersAsync();
      const result = await p;
      collected.push(...result.items);
      if (!result.hasMore) break;
      offset = result.nextOffset;
    }

    expect(visitedOffsets).toEqual([0, 100, 200, 300]);
    expect(collected).toHaveLength(TOTAL);
    expect(new Set(collected).size).toBe(TOTAL);
    expect(collected[0]).toBe(TOTAL);
    expect(collected[TOTAL - 1]).toBe(1);
  });

  it("mostRecent=true, offset >= total: empty page reports hasMore=false and caller's offset", async () => {
    // Must not leak the limit=1 count probe's pagination fields.
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      makeJsonResponse({
        items: [1],
        limit: 1,
        offset: 0,
        count: 1,
        total: 328,
        hasMore: true,
        nextOffset: 1,
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const p = fetchWithPagination(
      "https://api.example.com",
      "key",
      "/api/v1/items",
      100,
      400,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(result.offset).toBe(400);
    expect(result.limit).toBe(100);
    expect(result.count).toBe(0);
    expect(result.total).toBe(328);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBeNull();
  });

  it("mostRecent=false: pagination fields pass through untouched", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      makeJsonResponse({
        items: [11, 12, 13, 14, 15],
        limit: 5,
        offset: 10,
        count: 5,
        total: 100,
        hasMore: true,
        nextOffset: 15,
      }),
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

    expect(result.offset).toBe(10);
    expect(result.limit).toBe(5);
    expect(result.count).toBe(5);
    expect(result.total).toBe(100);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(15);
    expect(result.items).toEqual([11, 12, 13, 14, 15]);
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
