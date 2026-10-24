# OpenCode V2 plugin migration — design

Date: 2026-10-24
Status: approved

## Goal

Port `opencode-screenshot-vision` from the OpenCode V1 plugin API to the V2
plugin API, with behavior parity and no V1 compatibility layer. The package
becomes V2-only; OpenCode 1.x users stay on the 1.x line.

## Non-goals

- No dual V1/V2 entrypoint (`server()` + `setup()`).
- No new capture sources, backends, or configuration options.
- No change to the `OPENCODE_VISION_*` environment contract.

## Entrypoint

```ts
export const VisionPlugin = Plugin.define({
  id: "opencode-screenshot-vision",
  async setup(ctx) { ... },
})
export default VisionPlugin
```

`setup` closes over `ctx.location.directory` and
`ctx.location.project.canonical`, because the V2 tool execution context no
longer carries `directory` or `worktree`. It returns a cleanup function that
aborts the event subscription.

`package.json` depends on `@opencode/plugin` (2.x) instead of
`@opencode-ai/plugin`, and drops the `./server` export.

## Hook mapping

| V1 | V2 | Notes |
|---|---|---|
| `tool: { vision }` | `ctx.tool.transform(e => e.add(...))` | JSON Schema input; returns `{ content }` |
| `tool.execute.after` | `ctx.tool.hook("execute.after", ...)` | `event.result` replacement is applied by the runtime (verified) |
| `chat.message` | `ctx.session.hook("prompt", ...)` | appends to `event.prompt.text`; `replace` mode removes image attachments |
| `chat.params` | `ctx.session.hook("context", ...)` | model ref only; capabilities resolved from `ctx.model.list()` |
| `event` (`session.deleted`) | `ctx.event.subscribe({ signal })` | id is at `event.data.sessionID` |

## Tool result images

V2 tool content is `{ type: "text" } | { type: "file", uri, mime, name? }`.
MCP image parts arrive as `file` content with a `data:` URI (confirmed against
the shipped runtime). The plugin reads images from either `uri` or `url` and
from the legacy `{ type: "image", data, mimeType }` shape, so a change in
normalization degrades one path instead of the feature.

## Backend discovery

`getCandidates` now reads `ctx.model.list()` plus `ctx.provider.list()`:

- image capability: `model.capabilities.input.includes("image")`
- base URL: `model.settings.baseURL ?? provider.settings.baseURL`; models
  without one are skipped
- credentials: `provider.integrationID` →
  `integration.connection.active()` → `.resolve()`; only `type: "key"`
  credentials carry a bearer token
- cost: `model.cost[]` tiers; free means every tier is zero; ordering uses the
  cheapest input tier

The `OPENCODE_VISION_LOCAL_MODEL` / `OPENCODE_VISION_LOCAL_URL` pin keeps
working and still takes candidate slot 0.

## Vision-capability tracking

`ModelVisionTracker` becomes `capabilities.input: string[]` aware. The
`context` hook resolves a model ref to a capability flag once per ref and
caches it for the plugin lifetime; an unresolved ref counts as "no vision", so
the plugin describes rather than silently passing an unreadable image.

## Behavior changes

- Pasted-image descriptions are appended to the user's prompt text instead of
  a synthetic message part. V2 has no synthetic-parts API. The
  `untrusted page-derived data` prefix stays, so the text remains labeled.
- Path allow-listing uses the plugin load location rather than the executing
  session's directory.

## Testing

- `backend-discovery.test.ts` and `main-model-capability.test.ts` are rewritten
  against the V2 shapes.
- `vision.integration.test.ts` drives a fake plugin context that records
  registered tools and hooks, then invokes them directly.
- `scripts/smoke-vision.ts` runs the same fake context against a live Ollama.
- `bun test`, `bun run typecheck`, `bun run build` must pass.

## Risks

- The smoke script and unit tests assert our understanding of the V2 contract;
  the runtime-verified facts above are the anchor.
- Provider base URLs come from provider settings. A provider that hides its
  URL drops out of local discovery; the environment pin is the escape hatch.
