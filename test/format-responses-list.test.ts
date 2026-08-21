import { describe, expect, it } from "vitest";
import {
  formatExperimentList,
  formatFeatureFlagList,
} from "../src/format-responses.js";

describe("formatExperimentList pagination", () => {
  it("empty page with total > 0: points at offset=0 instead of 'no experiments'", () => {
    const text = formatExperimentList({
      experiments: [],
      total: 328,
      limit: 100,
      offset: 400,
      count: 0,
      hasMore: false,
      nextOffset: null,
    } as any);

    expect(text).toContain("offset is past the end");
    expect(text).toContain("Total: 328");
    expect(text).toContain("Use offset=0");
    expect(text).not.toContain("create_experiment");
  });

  it("empty list with no total: keeps the create_experiment hint", () => {
    const text = formatExperimentList({ experiments: [] } as any);

    expect(text).toContain("No experiments found");
    expect(text).toContain("create_experiment");
  });

  it("renders the hasMore footer with nextOffset", () => {
    const text = formatExperimentList({
      experiments: [
        { id: "exp_1", name: "Exp 1", status: "running" },
        { id: "exp_2", name: "Exp 2", status: "draft" },
      ],
      total: 328,
      limit: 2,
      offset: 0,
      count: 2,
      hasMore: true,
      nextOffset: 2,
    } as any);

    expect(text).toContain("Showing 2 of 328");
    expect(text).toContain("Use offset=2 to see more");
  });
});

describe("formatFeatureFlagList pagination", () => {
  it("empty page with total > 0: points at offset=0 instead of 'no feature flags'", () => {
    const text = formatFeatureFlagList({
      features: [],
      total: 42,
      limit: 100,
      offset: 100,
      count: 0,
      hasMore: false,
      nextOffset: null,
    } as any);

    expect(text).toContain("offset is past the end");
    expect(text).toContain("Total: 42");
    expect(text).toContain("Use offset=0");
    expect(text).not.toContain("create_feature_flag");
  });

  it("empty list with no total: keeps the create_feature_flag hint", () => {
    const text = formatFeatureFlagList({ features: [] } as any);

    expect(text).toContain("No feature flags found");
    expect(text).toContain("create_feature_flag");
  });
});
