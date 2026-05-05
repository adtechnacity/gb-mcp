import { formatList, generateLinkToGrowthBook } from "./utils.js";
import type { MetricLookup } from "./tools/experiments/summary-logic.js";
import type {
  ListSdkConnectionsResponse,
  ListProjectsResponse,
  ListEnvironmentsResponse,
  ListAttributesResponse,
  ListFeaturesResponse,
  GetFeatureResponse,
  CreateFeatureResponse,
  UpdateFeatureResponse,
  ListExperimentsResponse,
  GetExperimentResponse,
  PostExperimentResponse,
  UpdateExperimentResponse,
  ListMetricsResponse,
  ListFactMetricsResponse,
  GetMetricResponse,
  GetFactMetricResponse,
  CreateFactMetricResponse,
  UpdateFactMetricResponse,
  ListFactTablesResponse,
  Feature,
  GetStaleFeatureResponse,
} from "./api-type-helpers.js";

// Helper to resolve a metric ID to a display name using an optional lookup
function resolveMetric(metricId: string, metricLookup?: MetricLookup): string {
  if (!metricLookup) return `\`${metricId}\``;
  const info = metricLookup.get(metricId);
  if (!info) return `\`${metricId}\``;
  const inverse = info.inverse ? " (inverse)" : "";
  return `**${info.name}** (\`${metricId}\`, ${info.type}${inverse})`;
}

function resolveMetricList(
  metrics: { metricId: string }[] | undefined,
  metricLookup?: MetricLookup,
): string {
  if (!metrics?.length) return "none";
  return metrics.map((g) => resolveMetric(g.metricId, metricLookup)).join(", ");
}

// ─── Projects ───────────────────────────────────────────────────────
export function formatProjects(data: ListProjectsResponse): string {
  const projects = data.projects || [];
  if (projects.length === 0) {
    return "No projects found. Features and experiments will be created without a project scope.";
  }

  const lines = projects.map((p) => {
    const parts = [`- **${p.name}** (id: \`${p.id}\`)`];
    if (p.description) parts.push(`  ${p.description}`);
    return parts.join("\n");
  });

  return [
    `**${projects.length} project(s):**`,
    "",
    ...lines,
    "",
    `Use the \`id\` value when creating feature flags or experiments scoped to a project.`,
  ].join("\n");
}

// ─── Environments ───────────────────────────────────────────────────
export function formatEnvironments(data: ListEnvironmentsResponse): string {
  const environments = data.environments || [];
  if (environments.length === 0) {
    return "No environments found. At least one environment (production) should exist.";
  }

  const lines = environments.map((e) => {
    const parts = [`- **${e.id}**`];
    if (e.description) parts.push(`: ${e.description}`);
    if (e.toggleOnList) parts.push(" (toggle on by default)");
    if (e.defaultState === false) parts.push(" (disabled by default)");
    return parts.join("");
  });

  return [`**${environments.length} environment(s):**`, "", ...lines].join(
    "\n",
  );
}

// ─── Attributes ─────────────────────────────────────────────────────
export function formatAttributes(data: ListAttributesResponse): string {
  const attributes = data.attributes || [];
  if (attributes.length === 0) {
    return "No targeting attributes configured. Attributes (like country, plan, userId) must be set up in GrowthBook before they can be used in targeting conditions.";
  }

  const lines = attributes.map((a) => {
    return `- **${a.property}** (${a.datatype}${
      a.hashAttribute ? ", hash attribute" : ""
    })`;
  });

  return [
    `**${attributes.length} attribute(s) available for targeting:**`,
    "",
    ...lines,
    "",
    `These can be used in targeting conditions (e.g. \`{"${attributes[0]?.property}": "value"}\`).`,
  ].join("\n");
}

// ─── SDK Connections ────────────────────────────────────────────────
export function formatSdkConnections(data: ListSdkConnectionsResponse): string {
  const connections = data.connections || [];
  if (connections.length === 0) {
    return "No SDK connections found. Use create_sdk_connection to create one for your app.";
  }

  const lines = connections.map((c) => {
    return `**${c.name}**:
  - Languages: ${formatList(c.languages)}
  - Environment: ${c.environment}
  - Client Key: \`${c.key}\`
  - Projects: ${formatList(c.projects || [])}`;
  });

  return [`**${connections.length} SDK connection(s):**`, "", ...lines].join(
    "\n",
  );
}

// ─── Feature Flags ──────────────────────────────────────────────────
export function formatFeatureFlagList(data: ListFeaturesResponse): string {
  const features = data.features || [];
  if (features.length === 0) {
    return "No feature flags found. Use create_feature_flag to create one.";
  }

  const lines = features.map((f) => {
    const envStatus = f.environments
      ? Object.entries(f.environments)
          .map(
            ([env, config]) =>
              `${env}: ${config.enabled ? "ON" : "OFF"}${
                config.rules?.length
                  ? ` (${config.rules.length} rule${
                      config.rules.length > 1 ? "s" : ""
                    })`
                  : ""
              }`,
          )
          .join(", ")
      : "no environments";
    const archived = f.archived ? " [ARCHIVED]" : "";
    return `- **${f.id}** (${f.valueType}) — default: \`${
      f.defaultValue
    }\`${archived}\n  Environments: ${envStatus}${
      f.project ? `\n  Project: ${f.project}` : ""
    }`;
  });

  const pagination = data.hasMore
    ? `\n\nShowing ${features.length} of ${data.total}. Use offset=${data.nextOffset} to see more.`
    : "";

  return [
    `**${features.length} feature flag(s):**`,
    "",
    ...lines,
    pagination,
  ].join("\n");
}

export function formatFeatureFlagDetail(
  data: GetFeatureResponse,
  appOrigin: string,
): string {
  const f = data.feature;
  if (!f) return "Feature flag not found.";

  const formatRule = (r: any, i: number): string => {
    const idTag = r.id ? ` (id: \`${r.id}\`)` : "";
    const disabledTag = r.enabled === false ? " [DISABLED]" : "";
    const desc = r.description ? ` — ${r.description}` : "";
    const condition = r.condition ? `\n      Condition: ${r.condition}` : "";
    const savedGroups = r.savedGroupTargeting?.length
      ? `\n      Saved groups: ${r.savedGroupTargeting.map((sg: any) => `${sg.matchType} of [${sg.savedGroups.join(", ")}]`).join("; ")}`
      : "";
    const schedule = r.scheduleRules?.length
      ? `\n      Schedule: ${r.scheduleRules.map((sr: any) => `${sr.enabled ? "enable" : "disable"} at ${sr.timestamp || "immediately"}`).join(", ")}`
      : "";
    const prerequisites = r.prerequisites?.length
      ? `\n      Prerequisites: ${r.prerequisites.map((p: any) => p.id).join(", ")}`
      : "";

    if (r.type === "force") {
      return `    ${i + 1}. Force rule${idTag}${disabledTag}: value=\`${r.value}\`${desc}${condition}${savedGroups}${schedule}${prerequisites}`;
    }
    if (r.type === "rollout") {
      return `    ${i + 1}. Rollout rule${idTag}${disabledTag}: value=\`${r.value}\`, coverage=${r.coverage}, hashAttribute=${r.hashAttribute || "id"}${desc}${condition}${savedGroups}${schedule}`;
    }
    if (r.type === "experiment-ref") {
      const variations = r.variations?.length
        ? `\n      Variations: ${r.variations.map((v: any) => `${v.variationId}=\`${v.value}\``).join(", ")}`
        : "";
      return `    ${i + 1}. Experiment rule${idTag}${disabledTag}: experimentId=\`${r.experimentId}\`${desc}${condition}${variations}${schedule}`;
    }
    if (r.type === "experiment") {
      const trackingKey = r.trackingKey
        ? `, trackingKey=\`${r.trackingKey}\``
        : "";
      const coverage = r.coverage != null ? `, coverage=${r.coverage}` : "";
      return `    ${i + 1}. Inline experiment${idTag}${disabledTag}${trackingKey}${coverage}${desc}${condition}${savedGroups}${schedule}`;
    }
    if (r.type === "safe-rollout") {
      return `    ${i + 1}. Safe rollout${idTag}${disabledTag}: status=${r.status || "running"}, control=\`${r.controlValue}\`, variation=\`${r.variationValue}\`${condition}${savedGroups}${prerequisites}`;
    }
    return `    ${i + 1}. ${r.type} rule${idTag}${disabledTag}${desc}`;
  };

  const envLines = f.environments
    ? Object.entries(f.environments).map(([env, config]) => {
        const status = config.enabled ? "ON" : "OFF";
        const rules = config.rules || [];
        const rulesSummary =
          rules.length > 0
            ? rules.map(formatRule).join("\n")
            : "    (no rules)";
        return `  **${env}**: ${status}\n${rulesSummary}`;
      })
    : [];

  const link = generateLinkToGrowthBook(appOrigin, "features", f.id);
  const archived = f.archived
    ? "\n**This flag is ARCHIVED.** Consider removing it from the codebase."
    : "";
  const tags = f.tags?.length ? `Tags: ${f.tags.join(", ")}` : "";
  const prereqs = f.prerequisites?.length
    ? `Prerequisites: ${f.prerequisites.join(", ")}`
    : "";

  return [
    `**Feature flag: \`${f.id}\`**${archived}`,
    `Type: ${f.valueType} | Default: \`${f.defaultValue}\` | Owner: ${
      f.owner || "unset"
    }${f.project ? ` | Project: ${f.project}` : ""}`,
    f.description ? `Description: ${f.description}` : "",
    tags,
    prereqs,
    "",
    "**Environments:**",
    ...envLines,
    "",
    `[View in GrowthBook](${link})`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Feature Flag Creation / Update ─────────────────────────────────
export function formatFeatureFlagCreated(
  data: CreateFeatureResponse,
  appOrigin: string,
  sdkStub: string,
  language: string,
  docsUrl: string,
): string {
  const f = data.feature;
  const id = f?.id || "unknown";
  const link = generateLinkToGrowthBook(appOrigin, "features", id);

  return [
    `**Feature flag \`${id}\` created.**`,
    `[View in GrowthBook](${link})`,
    "",
    "**SDK integration:**",
    sdkStub,
    "",
    `[${language} docs](${docsUrl})`,
  ].join("\n");
}

export function formatForceRuleCreated(
  data: UpdateFeatureResponse,
  appOrigin: string,
  featureId: string,
  sdkStub: string,
  language: string,
  docsUrl: string,
): string {
  const link = generateLinkToGrowthBook(appOrigin, "features", featureId);

  return [
    `**Targeting rule added to \`${featureId}\`.**`,
    `[View in GrowthBook](${link})`,
    "",
    "**SDK integration:**",
    sdkStub,
    "",
    `[${language} docs](${docsUrl})`,
  ].join("\n");
}

// ─── Feature Flag Write Formatters ──────────────────────────────────

export function formatFeatureFlagUpdated(
  data: UpdateFeatureResponse,
  appOrigin: string,
): string {
  return [
    `**Feature flag \`${data.feature?.id}\` updated.**`,
    "",
    formatFeatureFlagDetail(data as any, appOrigin),
  ].join("\n");
}

export function formatFeatureFlagToggled(
  featureId: string,
  environments: Record<string, boolean>,
): string {
  const envLines = Object.entries(environments).map(
    ([env, enabled]) => `- **${env}**: ${enabled ? "ON" : "OFF"}`,
  );
  return [`**Feature flag \`${featureId}\` toggled.**`, "", ...envLines].join(
    "\n",
  );
}

export function formatFeatureRuleAdded(
  data: GetFeatureResponse | UpdateFeatureResponse,
  appOrigin: string,
  environment: string,
  ruleType: string,
): string {
  const featureId = "feature" in data ? data.feature?.id : "unknown";
  const link = generateLinkToGrowthBook(
    appOrigin,
    "features",
    featureId || "unknown",
  );
  return [
    `**${ruleType} rule added to \`${featureId}\` in ${environment}.**`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFeatureRulesReordered(
  data: GetFeatureResponse | UpdateFeatureResponse,
  appOrigin: string,
  environment: string,
  ruleIds: string[],
): string {
  const featureId = "feature" in data ? data.feature?.id : "unknown";
  const link = generateLinkToGrowthBook(
    appOrigin,
    "features",
    featureId || "unknown",
  );
  return [
    `**Rules reordered for \`${featureId}\` in ${environment}.**`,
    "",
    `New order: ${ruleIds.map((id, i) => `${i + 1}. \`${id}\``).join(", ")}`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFeatureRuleRemoved(
  data: GetFeatureResponse | UpdateFeatureResponse,
  appOrigin: string,
  environment: string,
  ruleId: string,
): string {
  const featureId = "feature" in data ? data.feature?.id : "unknown";
  const link = generateLinkToGrowthBook(
    appOrigin,
    "features",
    featureId || "unknown",
  );
  return [
    `**Rule \`${ruleId}\` removed from \`${featureId}\` in ${environment}.**`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

// ─── Experiments ────────────────────────────────────────────────────
export function formatExperimentList(data: ListExperimentsResponse): string {
  const experiments = data.experiments || [];
  if (experiments.length === 0) {
    return "No experiments found. Use create_experiment to create one.";
  }

  const lines = experiments.map((e) => {
    const status = e.status || "unknown";
    const variations = e.variations
      ? e.variations.map((v: any) => v.name).join(" vs ")
      : "no variations";
    const goalCount = e.settings?.goals?.length || 0;
    return `- **${e.name}** (id: \`${
      e.id
    }\`, status: ${status})\n  Variations: ${variations}${
      goalCount > 0 ? ` | Goals: ${goalCount} metric(s)` : ""
    }${e.project ? ` | Project: ${e.project}` : ""}`;
  });

  const pagination = data.hasMore
    ? `\n\nShowing ${experiments.length} of ${data.total}. Use offset=${data.nextOffset} to see more.`
    : "";

  return [
    `**${experiments.length} experiment(s):**`,
    "",
    ...lines,
    pagination,
  ].join("\n");
}

export function formatExperimentDetail(
  data:
    | (GetExperimentResponse & { result?: unknown })
    | GetExperimentResponse["experiment"],
  appOrigin: string,
  metricLookup?: MetricLookup,
): string {
  const e =
    "experiment" in data && data.experiment
      ? data.experiment
      : (data as GetExperimentResponse["experiment"]);
  if (!e?.id) return "Experiment not found.";

  const link = generateLinkToGrowthBook(appOrigin, "experiment", e.id);
  const variations = e.variations
    ? e.variations
        .map(
          (v) =>
            `${v.name} (key: \`${v.key}\`, variationId: \`${v.variationId}\`)`,
        )
        .join(", ")
    : "none";

  const parts: string[] = [
    `**Experiment: ${e.name}** (id: \`${e.id}\`, status: ${e.status}, type: ${e.type || "standard"})`,
  ];

  if (e.archived) parts.push("**This experiment is ARCHIVED.**");
  if (e.hypothesis) parts.push(`Hypothesis: ${e.hypothesis}`);
  if (e.description) parts.push(`Description: ${e.description}`);
  parts.push(`Variations: ${variations}`);
  parts.push(
    `Goal metrics: ${resolveMetricList(e.settings?.goals, metricLookup)}`,
  );
  const secondary = resolveMetricList(
    e.settings?.secondaryMetrics,
    metricLookup,
  );
  if (secondary !== "none") parts.push(`Secondary metrics: ${secondary}`);
  parts.push(
    `Guardrail metrics: ${resolveMetricList(e.settings?.guardrails, metricLookup)}`,
  );
  if (e.trackingKey) parts.push(`Tracking key: \`${e.trackingKey}\``);
  if (e.hashAttribute) parts.push(`Hash attribute: \`${e.hashAttribute}\``);
  if (e.project) parts.push(`Project: ${e.project}`);
  if (e.owner) parts.push(`Owner: ${e.owner}`);
  if (e.tags?.length) parts.push(`Tags: ${e.tags.join(", ")}`);

  // Linked features
  if (e.linkedFeatures?.length) {
    parts.push(
      `Linked features: ${e.linkedFeatures.map((f) => `\`${f}\``).join(", ")}`,
    );
  }

  // Result summary (if experiment has concluded)
  if (e.resultSummary) {
    const rs = e.resultSummary;
    parts.push("");
    parts.push("**Result summary:**");
    if (rs.status) parts.push(`  Status: ${rs.status}`);
    if (rs.winner) parts.push(`  Winner: \`${rs.winner}\``);
    if (rs.conclusions) parts.push(`  Conclusions: ${rs.conclusions}`);
    if (rs.releasedVariationId)
      parts.push(`  Released variation: \`${rs.releasedVariationId}\``);
  }

  // Phases (traffic allocation history)
  if (e.phases?.length) {
    parts.push("");
    parts.push(`**Phases (${e.phases.length}):**`);
    for (const [idx, phase] of e.phases.entries()) {
      const dateRange = `${phase.dateStarted || "?"} → ${phase.dateEnded || "ongoing"}`;
      const traffic = phase.trafficSplit?.length
        ? phase.trafficSplit
            .map((t) => `${t.variationId}: ${(t.weight * 100).toFixed(0)}%`)
            .join(", ")
        : "even split";
      const coverageStr =
        phase.coverage != null
          ? `, coverage: ${(phase.coverage * 100).toFixed(0)}%`
          : "";
      const targeting = phase.targetingCondition
        ? `\n    Targeting: ${phase.targetingCondition}`
        : "";
      parts.push(
        `  ${idx + 1}. ${phase.name || `Phase ${idx + 1}`} (${dateRange})\n    Traffic: ${traffic}${coverageStr}${targeting}`,
      );
      if (phase.reasonForStopping)
        parts.push(`    Stopped: ${phase.reasonForStopping}`);
    }
  }

  // Bandit-specific settings
  if (e.type === "multi-armed-bandit") {
    const banditParts: string[] = [];
    if (e.banditScheduleValue)
      banditParts.push(
        `schedule: ${e.banditScheduleValue} ${e.banditScheduleUnit || "hours"}`,
      );
    if (e.banditBurnInValue)
      banditParts.push(
        `burn-in: ${e.banditBurnInValue} ${e.banditBurnInUnit || "hours"}`,
      );
    if (banditParts.length)
      parts.push(`Bandit settings: ${banditParts.join(", ")}`);
  }

  parts.push("");
  parts.push(`[View in GrowthBook](${link})`);

  return parts.join("\n");
}

export function formatExperimentCreated(
  experimentData: PostExperimentResponse,
  appOrigin: string,
  sdkStub: string | undefined,
  language: string,
  docsUrl: string,
): string {
  const e = experimentData.experiment;
  const link = generateLinkToGrowthBook(appOrigin, "experiment", e.id);
  const variations = e.variations
    ? e.variations
        .map((v) => `${v.name} (variationId: \`${v.variationId}\`)`)
        .join(", ")
    : "none";

  const parts = [
    `**Draft experiment \`${e.name}\` created.** [Review and launch in GrowthBook](${link})`,
    "",
    `Variations: ${variations}`,
    `Tracking key: \`${e.trackingKey}\``,
  ];

  if (sdkStub) {
    parts.push(
      "",
      "**SDK integration:**",
      sdkStub,
      "",
      `[${language} docs](${docsUrl})`,
    );
  }

  return parts.join("\n");
}

// ─── Experiment Write Formatters ────────────────────────────────────
// Note: These formatters accept UpdateExperimentResponse (from POST /experiments/{id})
// which differs from GetExperimentResponse (GET). We cast to `any` when delegating
// to formatExperimentDetail since the shared fields (id, name, variations, etc.) overlap.

export function formatExperimentUpdated(
  data: UpdateExperimentResponse,
  appOrigin: string,
): string {
  return [
    `**Experiment updated.**`,
    "",
    formatExperimentDetail(data as any, appOrigin),
  ].join("\n");
}

export function formatExperimentStarted(
  data: UpdateExperimentResponse,
  appOrigin: string,
): string {
  const e = data.experiment;
  if (!e?.id) return "Experiment started, but details unavailable.";
  return [
    `**Experiment \`${e.id}\` started.**`,
    `Status is now **running**.`,
    "",
    formatExperimentDetail(data as any, appOrigin),
  ].join("\n");
}

export function formatExperimentStopped(
  data: UpdateExperimentResponse,
  appOrigin: string,
  releasedVariationId?: string,
  reason?: string,
): string {
  const e = data.experiment;
  if (!e?.id) return "Experiment stopped, but details unavailable.";
  const parts = [`**Experiment \`${e.id}\` stopped.**`];
  if (releasedVariationId) {
    const winnerName = e?.variations?.find(
      (v: any) => v.variationId === releasedVariationId,
    )?.name;
    parts.push(
      `Winner: **${winnerName || releasedVariationId}** (\`${releasedVariationId}\`)`,
    );
  }
  if (reason) parts.push(`Reason: ${reason}`);
  parts.push("");
  parts.push(formatExperimentDetail(data as any, appOrigin));
  return parts.join("\n");
}

export function formatExperimentArchived(
  experimentId: string,
  archived: boolean,
): string {
  return `**Experiment \`${experimentId}\` ${archived ? "archived" : "unarchived"}.**`;
}

export function formatExperimentTargetingUpdated(
  data: UpdateExperimentResponse,
  appOrigin: string,
  mode: "newPhase" | "patchCurrent",
): string {
  const e = data.experiment;
  if (!e?.id) return "Experiment targeting updated, but details unavailable.";

  const phases = e.phases || [];
  const phaseCount = phases.length;
  const currentPhase = phases[phases.length - 1];

  const parts: string[] = [
    `**Experiment \`${e.id}\` targeting updated.**`,
    mode === "newPhase"
      ? `Appended new phase (now at ${phaseCount} phase${phaseCount === 1 ? "" : "s"}).`
      : `Patched current phase in place (phase ${phaseCount}).`,
  ];

  if (currentPhase) {
    const details: string[] = [];
    if (currentPhase.name) details.push(`name: \`${currentPhase.name}\``);
    if (currentPhase.coverage != null)
      details.push(`coverage: ${(currentPhase.coverage * 100).toFixed(0)}%`);
    if (currentPhase.trafficSplit?.length) {
      const traffic = currentPhase.trafficSplit
        .map((t: any) => `${t.variationId}: ${(t.weight * 100).toFixed(0)}%`)
        .join(", ");
      details.push(`trafficSplit: ${traffic}`);
    }
    if (currentPhase.targetingCondition)
      details.push(`condition: ${currentPhase.targetingCondition}`);
    if (details.length) parts.push(`Active phase — ${details.join("; ")}`);
  }

  parts.push("");
  parts.push(formatExperimentDetail(data as any, appOrigin));
  return parts.join("\n");
}

export function formatSnapshotResult(
  experimentId: string,
  status: "success" | "timeout" | "error",
  appOrigin: string,
  snapshotId?: string,
  dimension?: string,
): string {
  const link = generateLinkToGrowthBook(appOrigin, "experiment", experimentId);
  if (status === "success") {
    const parts = [`**Experiment \`${experimentId}\` results refreshed.**`];
    if (dimension) {
      parts.push(`Dimension breakdown: \`${dimension}\``);
    }
    parts.push("", `[View in GrowthBook](${link})`);
    return parts.join("\n");
  }
  if (status === "timeout") {
    const parts = [
      `**Snapshot for \`${experimentId}\` is still processing (timeout).**`,
    ];
    if (snapshotId) {
      parts.push(`Snapshot ID: \`${snapshotId}\` — check back later.`);
    }
    if (dimension) {
      parts.push(`Requested dimension: \`${dimension}\``);
    }
    parts.push("", `[View in GrowthBook](${link})`);
    return parts.join("\n");
  }
  return `**Error refreshing results for \`${experimentId}\`.** [View in GrowthBook](${link})`;
}

// ─── Metrics ────────────────────────────────────────────────────────
export function formatMetricsList(
  metricsData: ListMetricsResponse,
  factMetricData: ListFactMetricsResponse,
): string {
  const metrics = metricsData.metrics || [];
  const factMetrics = factMetricData.factMetrics || [];

  if (metrics.length === 0 && factMetrics.length === 0) {
    return "No metrics found. Metrics must be created GrowthBook before they can be used in experiments.";
  }

  const parts: string[] = [];

  if (factMetrics.length > 0) {
    parts.push(`**${factMetrics.length} fact metric(s)**:`);
    parts.push("");
    for (const m of factMetrics) {
      const desc = m.description ? ` — ${m.description}` : "";
      parts.push(`- **${m.name}** (id: \`${m.id}\`)${desc}`);
    }
  }

  if (metrics.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push(`**${metrics.length} legacy metric(s):**`);
    parts.push("");
    for (const m of metrics) {
      const desc = m.description ? ` — ${m.description}` : "";
      const type = m.type ? ` [${m.type}]` : "";
      parts.push(`- **${m.name}** (id: \`${m.id}\`)${type}${desc}`);
    }
  }

  parts.push("");
  parts.push(
    "Use metric `id` values when configuring experiment goals and guardrails. Fact metrics (ids starting with `fact__`) are recommended over legacy metrics.",
  );

  return parts.join("\n");
}

export function formatMetricDetail(
  data: {
    metric?: GetMetricResponse["metric"];
    factMetric?: GetFactMetricResponse["factMetric"];
  },
  appOrigin: string,
): string {
  const m = data.metric || data.factMetric;
  if (!m) return "Metric not found.";

  const isFactMetric = !!data.factMetric;
  const resource = isFactMetric ? "fact-metrics" : "metric";
  const link = generateLinkToGrowthBook(appOrigin, resource, m.id);

  const metricType = isFactMetric
    ? "fact metric"
    : "type" in m
      ? ((m as { type?: string }).type ?? "legacy")
      : "legacy";
  return [
    `**Metric: ${m.name}** (id: \`${m.id}\`, type: ${metricType})`,
    m.description ? `Description: ${m.description}` : "",
    "inverse" in m && (m as { inverse?: boolean }).inverse
      ? "**Inverse metric** — lower is better"
      : "",
    "",
    `[View in GrowthBook](${link})`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Fact Metric Write Formatters ───────────────────────────────────

export function formatFactMetricCreated(
  data: CreateFactMetricResponse,
  appOrigin: string,
): string {
  const m = data.factMetric;
  if (!m) return "Fact metric created, but details unavailable.";
  const link = generateLinkToGrowthBook(appOrigin, "fact-metrics", m.id || "");
  return [
    `**Fact metric \`${m.name}\` created.** (id: \`${m.id}\`, type: ${m.metricType})`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFactMetricUpdated(
  data: UpdateFactMetricResponse,
  appOrigin: string,
): string {
  const m = data.factMetric;
  if (!m) return "Fact metric updated, but details unavailable.";
  const link = generateLinkToGrowthBook(appOrigin, "fact-metrics", m.id || "");
  return [
    `**Fact metric \`${m.id}\` updated.** (${m.name}, type: ${m.metricType})`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFactTableList(data: ListFactTablesResponse): string {
  const tables = (data as any).factTables || [];
  if (tables.length === 0) {
    return "No fact tables found. Fact tables must be created in GrowthBook before fact metrics can reference them.";
  }
  const lines = tables.map((t: any) => {
    const desc = t.description ? ` — ${t.description}` : "";
    const sql = t.sql ? `\n  SQL: \`${t.sql.replace(/\n/g, " ").trim()}\`` : "";
    return `- **${t.name}** (id: \`${t.id}\`)${desc}\n  Datasource: \`${t.datasource}\`${sql}`;
  });
  return [`**${tables.length} fact table(s):**`, "", ...lines].join("\n");
}

export function formatFactMetricList(data: ListFactMetricsResponse): string {
  const metrics = (data as any).factMetrics || [];
  if (metrics.length === 0) {
    return "No fact metrics found. Use create_fact_metric to create one.";
  }
  const lines = metrics.map((m: any) => {
    const desc = m.description ? ` — ${m.description}` : "";
    let bindings = "";
    if (m.numerator) {
      bindings += `\n  Numerator: \`${m.numerator.factTableId}\`${m.numerator.column ? ` (column: \`${m.numerator.column}\`)` : ""}`;
    }
    if (m.denominator) {
      bindings += `\n  Denominator: \`${m.denominator.factTableId}\`${m.denominator.column ? ` (column: \`${m.denominator.column}\`)` : ""}`;
    }
    return `- **${m.name}** (id: \`${m.id}\`, type: ${m.metricType})${desc}${bindings}`;
  });
  return [`**${metrics.length} fact metric(s):**`, "", ...lines].join("\n");
}

// ─── Fact Table Write Formatters ─────────────────────────────────────

export function formatFactTableCreated(data: any, appOrigin: string): string {
  const t = data.factTable;
  if (!t) return "Fact table created, but details unavailable.";
  const link = generateLinkToGrowthBook(appOrigin, "fact-tables", t.id || "");
  return [
    `**Fact table \`${t.name}\` created.** (id: \`${t.id}\`, datasource: \`${t.datasource}\`)`,
    "",
    t.sql
      ? `SQL: \`${t.sql.replace(/\n/g, " ").trim().slice(0, 200)}${t.sql.length > 200 ? "..." : ""}\``
      : "",
    "",
    `[View in GrowthBook](${link})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatFactTableUpdated(data: any, appOrigin: string): string {
  const t = data.factTable;
  if (!t) return "Fact table updated, but details unavailable.";
  const link = generateLinkToGrowthBook(appOrigin, "fact-tables", t.id || "");
  return [
    `**Fact table \`${t.id}\` updated.** (${t.name}, datasource: \`${t.datasource}\`)`,
    "",
    `[View in GrowthBook](${link})`,
  ].join("\n");
}

export function formatFactTableDeleted(data: any): string {
  const id = data.deletedId;
  return id ? `**Fact table \`${id}\` deleted.**` : "Fact table deleted.";
}

export function formatFactMetricDeleted(data: any): string {
  const id = data.deletedId;
  return id ? `**Fact metric \`${id}\` deleted.**` : "Fact metric deleted.";
}

// ─── Dimension Formatters ────────────────────────────────────────────

export function formatDimensionList(data: any): string {
  const dims = (data as any).dimensions || [];
  if (dims.length === 0) {
    return "No dimensions found. Use create_dimension to create one.";
  }
  const lines = dims.map((d: any) => {
    const desc = d.description ? ` — ${d.description}` : "";
    const sql = d.query
      ? `\n  SQL: \`${d.query.replace(/\n/g, " ").trim().slice(0, 150)}${d.query.length > 150 ? "..." : ""}\``
      : "";
    return `- **${d.name}** (id: \`${d.id}\`)${desc}\n  Datasource: \`${d.datasourceId}\`, Identifier: \`${d.identifierType}\`${sql}`;
  });
  return [`**${dims.length} dimension(s):**`, "", ...lines].join("\n");
}

export function formatDimensionCreated(data: any): string {
  const d = data.dimension;
  if (!d) return "Dimension created, but details unavailable.";
  return [
    `**Dimension \`${d.name}\` created.** (id: \`${d.id}\`)`,
    `Datasource: \`${d.datasourceId}\`, Identifier: \`${d.identifierType}\``,
    d.query
      ? `SQL: \`${d.query.replace(/\n/g, " ").trim().slice(0, 150)}${d.query.length > 150 ? "..." : ""}\``
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDimensionDeleted(data: any): string {
  const id = data.deletedId;
  return id ? `**Dimension \`${id}\` deleted.**` : "Dimension deleted.";
}

// ─── Fact Table Filter Formatters ────────────────────────────────────

export function formatFactTableFilterList(data: any): string {
  const filters = (data as any).factTableFilters || [];
  if (filters.length === 0) {
    return "No filters found on this fact table. Use create_fact_table_filter to create one.";
  }
  const lines = filters.map((f: any) => {
    const desc = f.description ? ` — ${f.description}` : "";
    return `- **${f.name}** (id: \`${f.id}\`)${desc}\n  Value: \`${f.value}\``;
  });
  return [`**${filters.length} filter(s):**`, "", ...lines].join("\n");
}

export function formatFactTableFilterCreated(data: any): string {
  const f = data.factTableFilter;
  if (!f) return "Filter created, but details unavailable.";
  return [
    `**Filter \`${f.name}\` created.** (id: \`${f.id}\`)`,
    `Value: \`${f.value}\``,
  ].join("\n");
}

export function formatFactTableFilterDeleted(data: any): string {
  const id = data.deletedId;
  return id ? `**Filter \`${id}\` deleted.**` : "Filter deleted.";
}

// ─── Defaults ───────────────────────────────────────────────────────
export function formatDefaults(defaults: any): string {
  const parts: string[] = [];
  parts.push("**Experiment defaults:**");
  parts.push("");

  parts.push(`Datasource: \`${defaults.datasource || "not set"}\``);
  parts.push(`Assignment query: \`${defaults.assignmentQuery || "not set"}\``);
  parts.push(
    `Environments: ${
      defaults.environments?.length
        ? defaults.environments.map((e: string) => `\`${e}\``).join(", ")
        : "none found"
    }`,
  );

  if (defaults.name?.length > 0) {
    const recentNames = defaults.name.slice(-5);
    parts.push("");
    parts.push("**Recent experiment naming examples:**");
    for (const name of recentNames) {
      if (name) parts.push(`- ${name}`);
    }
  }

  if (defaults.hypothesis?.length > 0) {
    const recentHypotheses = defaults.hypothesis.filter(Boolean).slice(-3);
    if (recentHypotheses.length > 0) {
      parts.push("");
      parts.push("**Recent hypothesis examples:**");
      for (const h of recentHypotheses) {
        parts.push(`- ${h}`);
      }
    }
  }

  return parts.join("\n");
}

// ─── Stale Features ─────────────────────────────────────────────────

export function formatStaleFeatureFlags(
  data: GetStaleFeatureResponse,
  requestedIds: string[],
): string {
  const features = data.features || {};
  const foundIds = Object.keys(features);

  if (foundIds.length === 0) {
    return "No features found for the given IDs. Check that the feature IDs are correct and your API key has access.";
  }

  const parts: string[] = [
    `**${foundIds.length} feature flag(s) checked:**`,
    "",
  ];

  let staleCount = 0;
  for (const id of requestedIds) {
    const f = features[id];
    if (!f) {
      parts.push(`- **\`${id}\`**: NOT FOUND`);
      continue;
    }

    if (f.neverStale) {
      parts.push(
        `- **\`${f.featureId}\`**: NOT STALE (stale detection disabled)`,
      );
      continue;
    }

    if (!f.isStale) {
      parts.push(
        `- **\`${f.featureId}\`**: NOT STALE${f.staleReason ? ` (${f.staleReason})` : ""}`,
      );
      continue;
    }

    // ── Stale flag: include replacement guidance ──
    staleCount++;

    const envEntries = f.staleByEnv ? Object.entries(f.staleByEnv) : [];
    const envsWithValues = envEntries.filter(
      ([, e]) => e.evaluatesTo !== undefined,
    );

    let replacementValue: string | undefined;
    let envNote: string;

    if (envsWithValues.length === 0) {
      replacementValue = undefined;
      envNote =
        "No deterministic value available — ask the user what the replacement should be.";
    } else {
      const values = new Set(envsWithValues.map(([, e]) => e.evaluatesTo));
      if (values.size === 1) {
        replacementValue = envsWithValues[0][1].evaluatesTo;
        envNote = `All environments agree.`;
      } else {
        // Environments disagree — default to production
        const prod = envsWithValues.find(([env]) => env === "production");
        if (prod) {
          replacementValue = prod[1].evaluatesTo;
          const others = envsWithValues
            .map(([env, e]) => `${env}=\`${e.evaluatesTo}\``)
            .join(", ");
          envNote = `Environments disagree (${others}). Using production value. Confirm with the user if a different environment should be used.`;
        } else {
          replacementValue = envsWithValues[0][1].evaluatesTo;
          const others = envsWithValues
            .map(([env, e]) => `${env}=\`${e.evaluatesTo}\``)
            .join(", ");
          envNote = `Environments disagree (${others}). No production environment found, using ${envsWithValues[0][0]}. Confirm with the user which environment to use.`;
        }
      }
    }

    if (replacementValue !== undefined) {
      parts.push(
        `- **\`${f.featureId}\`**: STALE (${f.staleReason}) — replace with: \`${replacementValue}\``,
      );
    } else {
      parts.push(
        `- **\`${f.featureId}\`**: STALE (${f.staleReason}) — needs manual review`,
      );
    }
    parts.push(`  ${envNote}`);
    parts.push(
      `  Search for \`${id}\` in relevant source files to find usages.`,
    );
    parts.push("");
  }

  // Summary
  const notFound = requestedIds.filter((id) => !features[id]);
  if (notFound.length > 0) {
    parts.push(
      `${notFound.length} flag(s) not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`,
    );
  }

  if (staleCount > 0) {
    parts.push(
      `**${staleCount} flag(s) ready for cleanup.** For each stale flag, find usages with the search patterns above, replace the flag check with the resolved value, and remove dead code branches. Confirm changes with the user before modifying files.`,
    );
  } else {
    parts.push("No stale flags found. All checked features are active.");
  }

  return parts.join("\n");
}

// ─── Helpful Errors ─────────────────────────────────────────────────
export function formatApiError(
  error: unknown,
  context: string,
  suggestions?: string[],
): string {
  const message = error instanceof Error ? error.message : String(error);

  const parts = [`Error ${context}: ${message}`];

  if (suggestions && suggestions.length > 0) {
    parts.push("");
    parts.push("Suggestions:");
    for (const s of suggestions) {
      parts.push(`- ${s}`);
    }
  }

  return parts.join("\n");
}
