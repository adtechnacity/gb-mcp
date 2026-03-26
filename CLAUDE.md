# CLAUDE.md

This file provides guidance when working with the GrowthBook MCP server codebase.

## Commands

```bash
npm run build              # TypeScript compilation (tsc) → outputs to server/
npm run dev                # Watch mode (tsc --watch)
npm test                   # Run all tests (vitest run)
npm run test:watch         # Vitest in watch mode
npm run test:coverage      # Vitest with coverage report
npm run generate-api-types # Regenerate API types from OpenAPI spec
npm run mcpb:build         # Build MCP bundle for distribution
```

## Version Management

Version lives in `package.json` and must be synced to `manifest.json` and `server.json`.

```bash
npm run bump:patch     # Bump patch version + sync all files
npm run bump:minor     # Bump minor version + sync all files
npm run bump:major     # Bump major version + sync all files
npm run sync-version   # Sync version from package.json → manifest.json + server.json
```

**Do NOT manually edit versions in manifest.json or server.json** — use the bump scripts or edit `package.json` then run `npm run sync-version`.

## Architecture

### Source Structure

```
src/
  index.ts              # Server entry point, registers all tool groups
  utils.ts              # Shared utilities (fetch, schemas, headers, rate limiting)
  format-responses.ts   # Response formatters for all tools (agent-friendly markdown)
  api-types.d.ts        # Auto-generated from OpenAPI spec (DO NOT EDIT)
  api-type-helpers.ts   # Typed aliases for specific API responses
  docs.ts               # SDK code snippets per language
  tools/
    features.ts         # Feature flag tools (CRUD, toggle, rules, reorder, remove)
    experiments/
      experiments.ts    # Experiment tools (CRUD, start, stop, archive, refresh results)
      experiment-summary.ts  # Summary mode logic and metric resolution
    defaults.ts         # Experiment defaults management
    environments.ts     # Environment listing
    projects.ts         # Project listing
    sdk-connections.ts  # SDK connection tools
    metrics.ts          # Metrics tools (get, create/update fact metrics, fact tables, fact table filters)
    dimensions.ts       # Dimension tools (list, create, delete)
    search.ts           # Documentation search
  prompts/              # MCP prompt registrations
  types/                # TypeScript type definitions
```

### Key Patterns

**Tool registration**: Each tool group has a `register*Tools()` function that receives `{ server, baseApiUrl, apiKey, appOrigin, user }` and registers tools via `server.registerTool()`.

**Response formatting**: All tool responses go through formatters in `format-responses.ts`. Never return raw `JSON.stringify()` — use or create a formatter that produces agent-friendly markdown. List views should be scannable summaries; detail views should include full configuration.

**API calls**: Use `fetchWithRateLimit()` for all API calls (adds courtesy delays and retry on 429). Use `buildHeaders(apiKey)` for request headers. Use `handleResNotOk(res)` to throw on non-2xx responses.

**Error handling**: Use `formatApiError(error, context, suggestions)` to produce errors with actionable suggestions for the agent.

**Input schemas**: Use Zod for all tool input schemas. Use `.superRefine()` for cross-field validation (e.g., ratio metrics requiring denominator). Reuse schemas from `featureFlagSchema` in utils.ts where applicable.

### Tool Annotations

Every tool must declare MCP annotations:

| Annotation               | Usage                                                |
| ------------------------ | ---------------------------------------------------- |
| `readOnlyHint: true`     | Read-only tools (get, list, search)                  |
| `readOnlyHint: false`    | Mutating tools (create, update, delete)              |
| `destructiveHint: true`  | Tools that delete data (e.g., `remove_feature_rule`) |
| `destructiveHint: false` | Mutating but non-destructive tools                   |
| `idempotentHint: true`   | Safe to retry (e.g., toggle, archive)                |

Read-only tools use shorthand: `annotations: { readOnlyHint: true }`. Write tools specify both: `annotations: { readOnlyHint: false, destructiveHint: false }`.

## Adding a New Tool

1. **Add the tool** in the appropriate file under `src/tools/`. Use `server.registerTool()` with a Zod input schema and correct annotations.
2. **Add a formatter** in `src/format-responses.ts` if the tool returns data. Follow the existing pattern of returning markdown-formatted strings. Guard against undefined fields.
3. **Add to manifest.json** — add a `{ "name": "tool_name", "description": "..." }` entry in the `tools` array.
4. **Add tests** — write tool tests in `test/tools/` following the `makeServerCapture()` pattern (see Testing section).
5. **Update CHANGELOG.md** — add the tool under the current version's `### Added` section.
6. **Run build and tests** — `npm run build && npm test`.

### Tool Description Best Practices

Tool descriptions directly influence how well AI agents use the tool:

- **Lead with what the tool needs** — if a parameter is required, say so upfront (e.g., "Given a list of feature flag IDs, checks whether...")
- **Reference other tools** — tell the agent which tools to use first (e.g., "Use list_feature_keys to get all flag IDs")
- **Keep it language-agnostic** — don't reference JS-specific SDK methods; users may be in Python, Go, Ruby, etc.
- **Avoid modes when possible** — simpler tools with a single response shape are easier for agents to use correctly
- **Handle missing required params gracefully** — return a helpful response (not an error) guiding the agent on how to gather the data

## Files That Must Stay in Sync

| Change             | Files to update                                                                       |
| ------------------ | ------------------------------------------------------------------------------------- |
| New tool           | `src/tools/*.ts`, `src/format-responses.ts`, `manifest.json`, `CHANGELOG.md`          |
| Version bump       | `package.json` → run `npm run sync-version` → updates `manifest.json` + `server.json` |
| API schema changes | Run `npm run generate-api-types`, update `api-type-helpers.ts` if needed              |
| Tool rename/remove | `src/tools/*.ts`, `src/format-responses.ts`, `manifest.json`, `CHANGELOG.md`          |

## API Types

`src/api-types.d.ts` is auto-generated from GrowthBook's OpenAPI spec. Do not edit it manually.

```bash
npm run generate-api-types
```

`src/api-type-helpers.ts` provides concrete type aliases for API responses used in tools:

```typescript
export type GetStaleFeatureResponse =
  Paths["/stale-features"]["get"]["responses"][200]["content"]["application/json"];
```

Add new type aliases here when working with new API endpoints.

## Testing

Tests use Vitest and live in `test/`. The project tests utility functions, tool registration, response formatting, and write tool behavior — not live API responses.

### Test Files

- `test/tools/readonly-tools.test.ts` — verifies read-only tools are registered with correct annotations
- `test/tools/write-tools-features.test.ts` — feature flag write tool behavior + validation
- `test/tools/write-tools-experiments.test.ts` — experiment lifecycle tool behavior + validation
- `test/tools/write-tools-metrics.test.ts` — metrics write tool behavior
- `test/tools/defaults.test.ts` — experiment defaults logic
- `test/tools/experiments/summary-logic.test.ts` — experiment summary formatting
- `test/format-responses-write.test.ts` — response formatter output for write tools

### Write Tool Test Pattern

Write tool tests use a shared pattern. Follow this for new write tools:

```typescript
// 1. Capture registered tools without starting a real server
function makeServerCapture() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (name, config, handler) => {
      tools.push({ name, config, handler });
    },
    server: { notification: vi.fn(async () => {}) },
  };
  return { server: server as any, tools };
}

// 2. Mock fetch with vi.stubGlobal and vi.useFakeTimers
vi.useFakeTimers();
vi.stubGlobal("fetch", fetchSpy);

// 3. Import and register tools (vi.doMock for defaults if needed)
vi.doMock("../../src/tools/defaults.js", () => ({ getDefaults: vi.fn(...) }));
const { registerFeatureTools } = await import("../../src/tools/features.js");
registerFeatureTools(baseArgs);

// 4. Call handler and advance timers
const p = tool!.handler({ featureId: "my-flag", ... });
await vi.runAllTimersAsync();
const res = await p;

// 5. Assert response and API call body
expect(res.content[0].text).toContain("updated");
const body = JSON.parse(postCall!.body!);
```

### Gotcha: Testing Rejections with Fake Timers

When testing that a handler throws/rejects, use `.catch()` to capture the error **before** advancing timers. The standard `expect().rejects.toThrow()` pattern doesn't work with fake timers:

```typescript
// WRONG — hangs with fake timers
await expect(tool.handler(args)).rejects.toThrow("...");

// CORRECT — capture error, then advance timers
const p = tool.handler(args).catch((e: any) => e);
await vi.runAllTimersAsync();
const err = await p;
expect(err).toBeInstanceOf(Error);
expect(err.message).toContain("...");
```

### Important: vi.resetModules

Each test file must call `vi.resetModules()` in `beforeEach` to ensure clean imports when using `vi.doMock()`. Without this, mocked modules leak between tests.

## External Documentation

The MCP docs page lives in the main GrowthBook repo at `docs/docs/integrations/mcp.mdx`. When adding or removing tools, update that file too.
