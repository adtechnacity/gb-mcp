import { describe, expect, it } from "vitest";
import {
  formatFeatureFlagUpdated,
  formatFeatureFlagToggled,
  formatFeatureRuleAdded,
  formatFeatureRulesReordered,
  formatFeatureRuleRemoved,
  formatExperimentUpdated,
  formatExperimentStarted,
  formatExperimentStopped,
  formatExperimentArchived,
  formatSnapshotResult,
  formatFactMetricCreated,
  formatFactMetricUpdated,
  formatFactTableList,
  formatFactMetricList,
} from "../src/format-responses.js";

describe("feature flag write formatters", () => {
  const mockFeatureResponse = {
    feature: {
      id: "test-flag",
      valueType: "boolean",
      defaultValue: "false",
      description: "A test flag",
      owner: "test@example.com",
      archived: false,
      tags: ["mcp"],
      environments: {
        production: { enabled: true, rules: [] },
        staging: { enabled: false, rules: [] },
      },
    },
  };
  const appOrigin = "https://app.growthbook.io";

  it("formatFeatureFlagUpdated includes success message and flag detail", () => {
    const result = formatFeatureFlagUpdated(mockFeatureResponse, appOrigin);
    expect(result).toContain("updated");
    expect(result).toContain("test-flag");
    expect(result).toContain("View in GrowthBook");
  });

  it("formatFeatureFlagToggled shows per-environment status", () => {
    const result = formatFeatureFlagToggled("test-flag", {
      production: true,
      staging: false,
    });
    expect(result).toContain("test-flag");
    expect(result).toContain("production");
    expect(result).toContain("staging");
  });

  it("formatFeatureRuleAdded includes environment and rule type", () => {
    const result = formatFeatureRuleAdded(
      mockFeatureResponse,
      appOrigin,
      "production",
      "force",
    );
    expect(result).toContain("rule added");
    expect(result).toContain("production");
    expect(result).toContain("test-flag");
  });

  it("formatFeatureRulesReordered confirms reorder", () => {
    const result = formatFeatureRulesReordered(
      mockFeatureResponse,
      appOrigin,
      "production",
      ["rule-1", "rule-2"],
    );
    expect(result).toContain("reordered");
    expect(result).toContain("production");
  });

  it("formatFeatureRuleRemoved confirms removal", () => {
    const result = formatFeatureRuleRemoved(
      mockFeatureResponse,
      appOrigin,
      "production",
      "rule-1",
    );
    expect(result).toContain("removed");
    expect(result).toContain("production");
  });
});

describe("experiment write formatters", () => {
  const appOrigin = "https://app.growthbook.io";
  const mockExperiment = {
    experiment: {
      id: "exp_123",
      name: "Test Experiment",
      status: "running",
      type: "standard",
      variations: [
        { variationId: "v0", key: "0", name: "Control" },
        { variationId: "v1", key: "1", name: "Treatment" },
      ],
      phases: [],
      settings: { goals: [], guardrails: [], secondaryMetrics: [] },
    },
  };

  it("formatExperimentUpdated includes success message", () => {
    const result = formatExperimentUpdated(mockExperiment, appOrigin);
    expect(result).toContain("updated");
    expect(result).toContain("Test Experiment");
  });

  it("formatExperimentStarted includes running status", () => {
    const result = formatExperimentStarted(mockExperiment, appOrigin);
    expect(result).toContain("started");
    expect(result).toContain("exp_123");
  });

  it("formatExperimentStopped includes winner info when provided", () => {
    const result = formatExperimentStopped(
      mockExperiment,
      appOrigin,
      "v1",
      "Treatment won with +15% conversion",
    );
    expect(result).toContain("stopped");
    expect(result).toContain("v1");
  });

  it("formatExperimentStopped works without winner", () => {
    const result = formatExperimentStopped(mockExperiment, appOrigin);
    expect(result).toContain("stopped");
    expect(result).not.toContain("Winner");
  });

  it("formatExperimentArchived shows archive status", () => {
    const result = formatExperimentArchived("exp_123", true);
    expect(result).toContain("archived");
  });

  it("formatExperimentArchived shows unarchive status", () => {
    const result = formatExperimentArchived("exp_123", false);
    expect(result).toContain("unarchived");
  });

  it("formatSnapshotResult includes experiment results", () => {
    const result = formatSnapshotResult("exp_123", "success", appOrigin);
    expect(result).toContain("exp_123");
    expect(result).toContain("refreshed");
  });

  it("formatSnapshotResult handles timeout", () => {
    const result = formatSnapshotResult(
      "exp_123",
      "timeout",
      appOrigin,
      "snap_456",
    );
    expect(result).toContain("timeout");
    expect(result).toContain("snap_456");
  });
});

describe("metrics write formatters", () => {
  const appOrigin = "https://app.growthbook.io";

  it("formatFactMetricCreated shows metric name and id", () => {
    const result = formatFactMetricCreated(
      {
        factMetric: {
          id: "fact__m1",
          name: "Conversion Rate",
          metricType: "proportion",
        },
      },
      appOrigin,
    );
    expect(result).toContain("created");
    expect(result).toContain("Conversion Rate");
    expect(result).toContain("fact__m1");
  });

  it("formatFactMetricUpdated shows metric name and id", () => {
    const result = formatFactMetricUpdated(
      {
        factMetric: {
          id: "fact__m1",
          name: "Updated Name",
          metricType: "mean",
        },
      },
      appOrigin,
    );
    expect(result).toContain("updated");
    expect(result).toContain("fact__m1");
  });

  it("formatFactTableList shows tables with ids", () => {
    const result = formatFactTableList({
      factTables: [
        {
          id: "ft_1",
          name: "Events",
          sql: "SELECT * FROM events",
          datasource: "ds_1",
        },
        {
          id: "ft_2",
          name: "Orders",
          sql: "SELECT * FROM orders",
          datasource: "ds_1",
        },
      ],
    });
    expect(result).toContain("2");
    expect(result).toContain("Events");
    expect(result).toContain("ft_1");
  });

  it("formatFactTableList handles empty list", () => {
    const result = formatFactTableList({ factTables: [] });
    expect(result).toContain("No fact tables");
  });

  it("formatFactMetricList shows metrics with types", () => {
    const result = formatFactMetricList({
      factMetrics: [
        { id: "fact__m1", name: "Conv Rate", metricType: "proportion" },
        { id: "fact__m2", name: "Revenue", metricType: "mean" },
      ],
    });
    expect(result).toContain("2");
    expect(result).toContain("Conv Rate");
    expect(result).toContain("proportion");
  });
});
