# Vision Autodiscovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add autodiscovery so the plugin skips backend inference when the main model has vision (A) and discovers vision-capable models from configured providers as ordered backends (B).

**Architecture:** Three focused units — `main-model-capability.ts` (per-session vision tracking), `backend-discovery.ts` (candidate discovery + ordering + TTL cache), and `vision.ts` (hooks + tools wiring both). `vision.ts` keeps the zen tiers as guaranteed fallback.

**Tech Stack:** TypeScript, `bun test` (test runner), `@opencode-ai/plugin` (plugin API: `client.provider.list()`, `chat.params` hook).

## Global Constraints

- Version floor: TypeScript ≥ 7.0.2, `@opencode-ai/plugin` ^1.18.18 (already in `package.json`). Add **no** new runtime dependencies.
- No new env vars. Only `OPENCODE_VISION_AUTO_MODE` gains the value `auto` and becomes the default; `append`/`replace`/`off` keep working.
- Backends: only OpenAI-compatible family (`${baseUrl}/chat/completions`). zen free + paid tiers stay as final fallback.
- No network calls in tests: discovery is driven through a minimal `DiscoveryClient` interface, never real HTTP.
- Never expose provider keys in logs/errors.
- Commands: `bun test`, `bun run typecheck`, `bun run build`.
- Keep the file style of the repo: no comments unless they explain a non-obvious decision, 2-space indent, single quotes.

---

### Task 1: `main-model-capability.ts` — main model vision detection

**Files:**
- Create: `main-model-capability.ts`
- Test: `main-model-capability.test.ts`

**Interfaces:**
- Produces (used by Task 3):
  - `export function hasImageCapability(model: { capabilities?: { input?: { image?: boolean } } }): boolean`
  - `export class ModelVisionTracker` with:
    - `track(model: { capabilities?: { input?: { image?: boolean } } }, sessionID: string): void`
    - `hasVision(sessionID: string): boolean`

The minimal model shape decouples this module from the SDK types and makes fixtures trivial. The real `Model` from `chat.params` structurally satisfies it.

- [ ] **Step 1: Write the failing test**

`main-model-capability.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { hasImageCapability, ModelVisionTracker } from "./main-model-capability"

function model(image?: boolean) {
  return { capabilities: { input: { image } } }
}

describe("hasImageCapability", () => {
  it("returns true when input.image is true", () => {
    expect(hasImageCapability(model(true))).toBe(true)
  })

  it("returns false when input.image is false", () => {
    expect(hasImageCapability(model(false))).toBe(false)
  })

  it("returns false when capabilities are missing", () => {
    expect(hasImageCapability({})).toBe(false)
  })
})

describe("ModelVisionTracker", () => {
  it("tracks a vision-capable model per session", () => {
    const tracker = new ModelVisionTracker()
    tracker.track(model(true), "ses_1")
    expect(tracker.hasVision("ses_1")).toBe(true)
  })

  it("tracks a text-only model as false", () => {
    const tracker = new ModelVisionTracker()
    tracker.track(model(false), "ses_1")
    expect(tracker.hasVision("ses_1")).toBe(false)
  })

  it("defaults unknown sessions to false", () => {
    expect(new ModelVisionTracker().hasVision("ses_unknown")).toBe(false)
  })

  it("evicts oldest sessions beyond the cap of 100", () => {
    const tracker = new ModelVisionTracker()
    for (let i = 0; i < 101; i++) tracker.track(model(true), `ses_${i}`)
    expect(tracker.hasVision("ses_0")).toBe(false)
    expect(tracker.hasVision("ses_100")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test main-model-capability.test.ts`
Expected: FAIL — module `./main-model-capability` not found.

- [ ] **Step 3: Write the implementation**

`main-model-capability.ts`:

```ts
export function hasImageCapability(model: {
  capabilities?: { input?: { image?: boolean } }
}): boolean {
  return Boolean(model.capabilities?.input?.image)
}

const MAX_SESSIONS = 100

export class ModelVisionTracker {
  private bySession = new Map<string, boolean>()

  track(model: { capabilities?: { input?: { image?: boolean } } }, sessionID: string): void {
    this.bySession.set(sessionID, hasImageCapability(model))
    if (this.bySession.size > MAX_SESSIONS) {
      const oldest = this.bySession.keys().next().value
      if (oldest !== undefined) this.bySession.delete(oldest)
    }
  }

  hasVision(sessionID: string): boolean {
    return this.bySession.get(sessionID) ?? false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test main-model-capability.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add main-model-capability.ts main-model-capability.test.ts
git commit -m "feat: track main model vision capability per session"
```

---

### Task 2: `backend-discovery.ts` — discover and order vision backends

**Files:**
- Create: `backend-discovery.ts`
- Test: `backend-discovery.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (used by Task 3):
  - `export interface BackendCandidate { providerID: string; name: string; url: string; model: string; auth?: string; local: boolean; free: boolean; costInput: number }`
  - `export interface DiscoveryClient { provider: { list(): Promise<{ data?: Array<{ id: string; key?: string; models: Record<string, ApiModel> }> }> } }` where `ApiModel = { id: string; name?: string; api: { url: string }; capabilities?: { input?: { image?: boolean } }; cost?: { input?: number; output?: number } }`
  - `export async function getCandidates(client: DiscoveryClient): Promise<BackendCandidate[]>`
  - `export function clearCache(): void`

Local types instead of SDK imports: keeps the module free of `@opencode-ai/sdk` type references in the published `.d.ts` and trivial to fixture in tests. The real `OpencodeClient` structurally satisfies `DiscoveryClient`.

Behavior: `getCandidates` returns the env-pinned local candidate first (if `OPENCODE_VISION_LOCAL_MODEL` or legacy `OPENCODE_VISION_OLLAMA_MODEL` is set), then discovered vision-capable OpenAI-compatible models ordered local → free → cost. `provider.list()` failure yields an empty list (no throw). Cache TTL 10 min; `clearCache()` forces re-discovery.

- [ ] **Step 1: Write the failing test**

`backend-discovery.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "bun:test"
import { getCandidates, clearCache, type DiscoveryClient } from "./backend-discovery"

const LOCAL_URL = "http://localhost:11434/v1"

function provider(
  id: string,
  models: Array<{
    id: string
    image?: boolean
    cost?: { input: number; output: number }
    url?: string
  }>,
  key?: string,
) {
  return {
    id,
    key,
    models: Object.fromEntries(
      models.map((m) => [
        m.id,
        {
          id: m.id,
          name: m.id,
          api: { url: m.url ?? LOCAL_URL },
          capabilities: { input: { image: m.image ?? true } },
          cost: m.cost ?? { input: 0, output: 0 },
        },
      ]),
    ),
  }
}

function client(providers: unknown[]): DiscoveryClient {
  return { provider: { list: async () => ({ data: providers as never }) } }
}

const defaultModel = { id: "gemma4:e4b", image: true }
const vision = (id: string, cost: { input: number; output: number }, url?: string) => ({ id, cost, url })

describe("getCandidates", () => {
  beforeEach(() => {
    delete process.env.OPENCODE_VISION_LOCAL_MODEL
    delete process.env.OPENCODE_VISION_OLLAMA_MODEL
    clearCache()
  })

  it("filters out models without image capability", async () => {
    const c = client([provider("ollama", [{ id: "qwen3", image: false }, defaultModel])])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(["gemma4:e4b"])
  })

  it("orders local first, then free, then cost", async () => {
    const c = client([
      provider("zen", [
        vision("paid-big", { input: 1, output: 2 }, "https://opencode.ai/zen/v1"),
        vision("free", { input: 0, output: 0 }, "https://opencode.ai/zen/v1"),
      ]),
      provider("ollama", [vision("local", { input: 0, output: 0 }, LOCAL_URL)]),
    ])
    const candidates = await getCandidates(c)
    expect(candidates.map((c) => c.model)).toEqual(["local", "free", "paid-big"])
  })

  it("prepends the env-pinned local model as candidate[0]", async () => {
    process.env.OPENCODE_VISION_LOCAL_MODEL = "gemma4:e4b"
    const c = client([provider("ollama", [vision("other", { input: 0, output: 0 }, LOCAL_URL)])])
    const candidates = await getCandidates(c)
    expect(candidates[0]).toMatchObject({ model: "gemma4:e4b", url: LOCAL_URL })
  })

  it("caches within TTL and re-discovers after clearCache", async () => {
    let calls = 0
    const c: DiscoveryClient = {
      provider: {
        list: async () => {
          calls++
          return { data: [provider("ollama", [defaultModel])] as never }
        },
      },
    }
    await getCandidates(c)
    await getCandidates(c)
    expect(calls).toBe(1)
    clearCache()
    await getCandidates(c)
    expect(calls).toBe(2)
  })

  it("returns an empty list when provider.list throws", async () => {
    const c: DiscoveryClient = {
      provider: { list: async () => { throw new Error("boom") } },
    }
    expect(await getCandidates(c)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test backend-discovery.test.ts`
Expected: FAIL — module `./backend-discovery` not found.

- [ ] **Step 3: Write the implementation**

`backend-discovery.ts`:

```ts
interface ApiModel {
  id: string
  name?: string
  api: { url: string }
  capabilities?: { input?: { image?: boolean } }
  cost?: { input?: number; output?: number }
}

interface ApiProvider {
  id: string
  key?: string
  models: Record<string, ApiModel>
}

export interface DiscoveryClient {
  provider: { list(): Promise<{ data?: ApiProvider[] }> }
}

export interface BackendCandidate {
  providerID: string
  name: string
  url: string
  model: string
  auth?: string
  local: boolean
  free: boolean
  costInput: number
}

const LOCAL_URL = (process.env.OPENCODE_VISION_LOCAL_URL ?? "http://localhost:11434/v1").replace(/\/+$/, "")

const TTL_MS = 10 * 60 * 1000

let cache: { at: number; candidates: BackendCandidate[] } | undefined

function isLoopbackUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|::1/i.test(url)
}

function isFree(model: ApiModel): boolean {
  return (model.cost?.input ?? 0) === 0 && (model.cost?.output ?? 0) === 0
}

function pinnedLocalCandidate(): BackendCandidate | undefined {
  const model = process.env.OPENCODE_VISION_LOCAL_MODEL ?? process.env.OPENCODE_VISION_OLLAMA_MODEL
  if (!model) return undefined
  return { providerID: "env", name: `Local (${model})`, url: LOCAL_URL, model, local: true, free: true, costInput: 0 }
}

function sortCandidates(candidates: BackendCandidate[]): BackendCandidate[] {
  return candidates.sort(
    (a, b) =>
      Number(b.local) - Number(a.local) ||
      Number(b.free) - Number(a.free) ||
      a.costInput - b.costInput ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )
}

export async function getCandidates(client: DiscoveryClient): Promise<BackendCandidate[]> {
  const pin = pinnedLocalCandidate()
  if (cache && Date.now() - cache.at < TTL_MS) return pin ? [pin, ...cache.candidates] : cache.candidates

  try {
    const providers = (await client.provider.list()).data ?? []
    const discovered: BackendCandidate[] = []
    for (const provider of providers) {
      for (const model of Object.values(provider.models ?? {})) {
        if (!model.capabilities?.input?.image) continue
        discovered.push({
          providerID: provider.id,
          name: model.name ?? model.id,
          url: model.api.url,
          model: model.id,
          auth: provider.key,
          local: isLoopbackUrl(model.api.url),
          free: isFree(model),
          costInput: model.cost?.input ?? Infinity,
        })
      }
    }
    cache = { at: Date.now(), candidates: sortCandidates(discovered) }
  } catch {
    cache = { at: Date.now(), candidates: [] }
  }
  return pin ? [pin, ...cache.candidates] : cache.candidates
}

export function clearCache(): void {
  cache = undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test backend-discovery.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `bun test && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend-discovery.ts backend-discovery.test.ts
git commit -m "feat: discover and order vision backends from configured providers"
```

---

### Task 3: Wire autodiscovery into `vision.ts`

**Files:**
- Modify: `vision.ts`
- Modify: `vision.test.ts`

**Interfaces:**
- Consumes:
  - `ModelVisionTracker` (Task 1): `track(model, sessionID)`, `hasVision(sessionID)`
  - `getCandidates(client: DiscoveryClient)`, `clearCache()` (Task 2)
- Produces:
  - `export function shouldAutoDescribe(mode: string, hasVision: boolean): boolean` (exported for tests)
  - `"chat.params"` hook added to the plugin
  - `describe()` now walks discovered candidates then zen fallback, clearing cache on total failure

Changes:
1. Import `ModelVisionTracker` from `./main-model-capability` and `getCandidates, clearCache` from `./backend-discovery`.
2. `AUTO_MODE` default becomes `"auto"`.
3. Add module-level `const visionTracker = new ModelVisionTracker()`.
4. Plugin factory: `export const VisionPlugin: Plugin = async ({ client }) => {` and use `client` inside `describe()` calls (tool execute, both hooks). The existing test passes `{}` as input — `client` is only used at call time, not at load, so the test still works.
5. Add `"chat.params"` hook that calls `visionTracker.track(input.model, input.sessionID)`.
6. Replace both `if (AUTO_MODE === "off") return` guards with `if (!shouldAutoDescribe(AUTO_MODE, visionTracker.hasVision(input.sessionID))) return`.
7. Refactor `localChat` → `openAiChat(candidate, image, mime, prompt)` that uses `candidate.url`, `candidate.model`, and optional `candidate.auth`. Delete `localChat`.
8. Rewrite `describe(client, image, prompt)`: walk candidates, then zen free/paid, then `clearCache()` and throw the aggregated error.

- [ ] **Step 1: Write the failing test for the decision function and structure**

Append to `vision.test.ts`:

```ts
import { VisionPlugin, contains, errorMessage, mimeOf, shouldAutoDescribe } from "./vision"

describe("shouldAutoDescribe", () => {
  it("never describes in off mode", () => {
    expect(shouldAutoDescribe("off", true)).toBe(false)
    expect(shouldAutoDescribe("off", false)).toBe(false)
  })

  it("always describes in append/replace even when the model sees", () => {
    expect(shouldAutoDescribe("append", true)).toBe(true)
    expect(shouldAutoDescribe("replace", true)).toBe(true)
  })

  it("skips in auto mode when the model sees", () => {
    expect(shouldAutoDescribe("auto", true)).toBe(false)
  })

  it("describes in auto mode when the model does not see", () => {
    expect(shouldAutoDescribe("auto", false)).toBe(true)
  })

  it("treats an unknown mode as auto", () => {
    expect(shouldAutoDescribe("bogus", true)).toBe(false)
  })
})

describe("plugin structure", () => {
  it("registers the chat.params hook", async () => {
    const hooks = await VisionPlugin({} as Parameters<typeof VisionPlugin>[0])
    expect(typeof hooks["chat.params"]).toBe("function")
  })
})
```

Note: merge this `describe("plugin structure", ...)` with the existing one at the top of `vision.test.ts` rather than adding a duplicate describe block.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test vision.test.ts`
Expected: FAIL — `shouldAutoDescribe` not exported / `chat.params` hook missing.

- [ ] **Step 3: Implement the decision function, default mode, and tracker**

Add near the top of `vision.ts`, after `AUTO_MODE`:

```ts
export function shouldAutoDescribe(mode: string, hasVision: boolean): boolean {
  if (mode === "off") return false
  if (mode === "append" || mode === "replace") return true
  return !hasVision
}
```

Change the default:

```ts
const AUTO_MODE = (process.env.OPENCODE_VISION_AUTO_MODE ?? "auto").toLowerCase()
```

Add the imports:

```ts
import { ModelVisionTracker } from "./main-model-capability"
import { getCandidates, clearCache } from "./backend-discovery"
```

Module-level (after `AUTO_MODE`):

```ts
const visionTracker = new ModelVisionTracker()
```

- [ ] **Step 4: Refactor the local backend into `openAiChat` and thread the client**

Replace `localChat` (current lines 198-223 of `vision.ts`) with:

```ts
async function openAiChat(candidate: BackendCandidate, image: string, mime: string, prompt: string): Promise<string> {
  const data = object(
    await postJson(
      `${candidate.url}/chat/completions`,
      {
        model: candidate.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
      },
      LOCAL_TIMEOUT_MS,
      candidate.auth,
    ),
  )
  const choice = Array.isArray(data?.choices) ? object(data.choices[0]) : undefined
  return requiredText(object(choice?.message)?.content, candidate.name)
}
```

`postJson` already accepts an `auth` parameter; the pinned local candidate has no `auth`, so no header is sent — same behavior as the old `localChat`.

Add the type import at the top of `vision.ts`:

```ts
import type { BackendCandidate } from "./backend-discovery"
```

Rewrite `describe` (current lines 297-324):

```ts
async function describe(client: unknown, image: LoadedImage, prompt: string): Promise<string> {
  const failures: string[] = []
  const candidates = await getCandidates(client as import("./backend-discovery").DiscoveryClient)

  for (const candidate of candidates) {
    try {
      return await openAiChat(candidate, image.base64, image.mime, prompt)
    } catch (error) {
      failures.push(`${candidate.name}: ${errorMessage(error)}`)
    }
  }

  let keyPromise: Promise<string> | undefined
  const key = () => (keyPromise ??= zenKey())
  for (const backend of [
    {
      name: `Zen Free (${ZEN_FREE_MODEL})`,
      run: async () => zenChat(await key(), image.base64, image.mime, prompt),
    },
    {
      name: `Zen Paid (${ZEN_PAID_MODEL})`,
      run: async () => zenResponses(await key(), image.base64, image.mime, prompt),
    },
  ]) {
    try {
      return await backend.run()
    } catch (error) {
      failures.push(`${backend.name}: ${errorMessage(error)}`)
    }
  }

  clearCache()
  throw new Error(
    `all vision backends failed:\n- ${failures.join("\n- ")}\n\n` +
      "If you requested several vision calls at once, retry them one at a time — local vision models can fail under concurrent load.",
  )
}
```

- [ ] **Step 5: Update the plugin factory and hooks**

Change the factory signature and capture `client`:

```ts
export const VisionPlugin: Plugin = async ({ client }) => {
  return {
    tool: {
      vision: tool({
        // args and description unchanged
        async execute(args, context) {
          const prompt = args.prompt?.trim()
            ? `${BASE_PROMPT}\n\nSpecific question: ${args.prompt.trim()}`
            : BASE_PROMPT
          const image = args.path
            ? await loadImageFromPath(args.path, context.directory, context.worktree)
            : imagesBySession.get(context.sessionID) ??
              (() => {
                throw new Error("no screenshot found in this conversation; capture one with the browser first")
              })()
          return describe(client, image, prompt)
        },
      }),
    },
    "chat.params": async (input) => {
      visionTracker.track(input.model, input.sessionID)
    },
    "chat.message": async (input, output) => {
      // existing body unchanged, EXCEPT:
      //   - the early return becomes:
      if (!shouldAutoDescribe(AUTO_MODE, visionTracker.hasVision(input.sessionID))) return
      //   - the describe call becomes: describe(client, image, BASE_PROMPT)
    },
    "tool.execute.after": async (input, output) => {
      if (!input.tool.toLowerCase().includes("screenshot")) return
      // existing image-capture body unchanged; rememberImage stays as-is
      // the AUTO_MODE guard (current line 446) becomes:
      if (!shouldAutoDescribe(AUTO_MODE, visionTracker.hasVision(input.sessionID))) return
      // the describe call becomes: describe(client, image, BASE_PROMPT)
    },
    event: async ({ event }) => {
      // unchanged
    },
  }
}
```

The `chat.message` hook currently receives `input` with `sessionID` (index.d.ts:187-199); `tool.execute.after` receives `input` with `sessionID` (index.d.ts:249-258) — both are already in scope in the existing code.

- [ ] **Step 6: Run the tests**

Run: `bun test`
Expected: PASS — existing tests plus the new `shouldAutoDescribe` and `chat.params` tests.

- [ ] **Step 7: Typecheck and build**

Run: `bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add vision.ts vision.test.ts
git commit -m "feat: skip auto-describe when the main model sees, discover backends"
```

---

### Task 4: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README configuration table**

In `README.md`, change the `OPENCODE_VISION_AUTO_MODE` row from:

```
| `OPENCODE_VISION_AUTO_MODE` | `append` | Auto-describe browser screenshots and pasted images: `append` (add description after the image), `replace` (description replaces the image), `off` (manual `vision` only) |
```

to:

```
| `OPENCODE_VISION_AUTO_MODE` | `auto` | Auto-describe browser screenshots and pasted images: `append` (add description after the image), `replace` (description replaces the image), `off` (manual `vision` only), `auto` (default: describe only when the main model cannot see images) |
```

- [ ] **Step 2: Add a README behavior note**

After the "Fallback chain" section, add:

```markdown
### Auto-skip when the main model has vision

The plugin reads the active model's `capabilities.input.image` from every request. With
`OPENCODE_VISION_AUTO_MODE=auto` (the default), an incoming image is **not** auto-described
when the main model can already see images — no backend inference runs. Set the mode
explicitly to `append`/`replace` to force auto-description, or `off` to disable it entirely.

### Discovered backends

The vision backends are no longer only the hardcoded local + Zen chain. On the first vision
call, the plugin lists the configured providers and uses every model with image capability,
ordered local-first, then free, then by cost. The local/`OPENCODE_VISION_LOCAL_MODEL` pin is
always tried first. Zen free and paid remain the guaranteed final fallback. The candidate
list is cached for 10 minutes and refreshed after a total failure.
```

- [ ] **Step 3: Update ROADMAP**

Under the shipped section, note the autodiscovery work is done:

```markdown
- Auto-discover a vision-capable model from configured providers — **done** (v1.5.0)
```

Keep the "Backend interface abstraction" and "More cloud providers" items as open.

- [ ] **Step 4: Update CHANGELOG**

Add to the `Unreleased` section:

```markdown
### Added

- Auto-skip backend inference when the main model has image capability (`AUTO_MODE=auto` default).
- Discover vision-capable models from configured providers as ordered backends (local-first, then free, then cost), with Zen as the guaranteed fallback.
```

- [ ] **Step 5: Full verification**

Run: `bun test && bun run typecheck && bun run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md ROADMAP.md CHANGELOG.md
git commit -m "docs: document vision autodiscovery and auto-skip behavior"
```

---

## Self-Review

- **Spec coverage:** A (skip when main model sees) → Tasks 1+3. B (discover + order) → Tasks 2+3. Env-pin → Task 2. TTL cache + retry/clear-on-failure → Tasks 2+3. Zen guaranteed fallback → Task 3. Error handling (`provider.list()` never throws) → Task 2. Docs/CHANGELOG/ROADMAP → Task 4. Acceptance criteria 1-12 map to tests in Tasks 1-3 and checks in Task 4. All covered.
- **Placeholder scan:** no TBD/TODO/`similar to`/broken scaffolding anywhere. Every step has concrete code.
- **Type consistency:** `BackendCandidate` fields (`local`/`free`/`costInput`) are set in Task 2 discovery and the pin, and consumed by `openAiChat` in Task 3 (reads only `url`, `model`, `auth`, `name` — no conflict). `describe(client, image, prompt)` signature used consistently in all three call sites. `shouldAutoDescribe(mode, hasVision)` matches its tests. `getCandidates(client: DiscoveryClient)` / `clearCache()` used as defined. The `client as import("./backend-discovery").DiscoveryClient` cast in `describe` avoids importing the type at module top while keeping the call valid.
