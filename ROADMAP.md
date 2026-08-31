# Roadmap

Versioned plan for `opencode-screenshot-vision`. Items are grouped by release and tagged with their [Conventional Commits](https://www.conventionalcommits.org) type, so the [SemVer](https://semver.org) bump and the changelog entry are already decided.

## Versioning policy

- **SemVer**: `MAJOR.MINOR.PATCH`.
- **Conventional Commits** drive the bump: `feat:` → MINOR, `fix:` → PATCH, `feat!:`/`fix!:` (or a `BREAKING CHANGE:` footer) → MAJOR.
- **CHANGELOG.md** follows [Keep a Changelog](https://keepachangelog.com): an `Unreleased` section accumulates changes, then becomes a dated release entry on tag.
- Each item lists its commit type, so "what to write in the changelog" is settled ahead of time.

## v1.0.0–v1.5.0 — shipped (released and tagged as `v1.5.0`)

Done so far:

- `vision` tool with browser-screenshot capture, pasted-image capture, and file mode.
- Local-first fallback chain (local OpenAI-compatible runtime → Zen free → Zen paid).
- Prompt-injection defense, path containment, MIME sniffing, size/token limits.
- Build to `dist/` with CI (typecheck + test + build), `CHANGELOG.md`, release-please, and OIDC publish workflow.
- Local OpenAI-compatible backend (`/v1/chat/completions` + configurable URL), so LM Studio, llama.cpp server, and vLLM work alongside Ollama.
- Auto-describe screenshots and pasted images (`OPENCODE_VISION_AUTO_MODE`: append/replace/off).
- Auto-skip backend inference when the main model has vision (`OPENCODE_VISION_AUTO_MODE=auto` default).
- Auto-discover vision-capable models from configured providers, ordered local-first → free → cost, Zen as guaranteed fallback.
- Configurable backend tier order via `OPENCODE_VISION_BACKENDS` (reorder and/or exclude `local` / `zen-free` / `zen-paid`).
- README, LICENSE, `package.json`.

## Backlog (unversioned)

| Item | Type | Note |
|---|---|---|
| Fallback-chain seam (deepen `describe`) | `refactor` | hot spot: `vision.ts` 25 commits. Unify `parseBackends` + tier loop + `openAiChat`/`zenChat` dup + `describe(client: unknown)` internal cast behind one `describeImage(image, prompt)` interface with per-family adapters. Sharpens the old "Backend interface abstraction" row. Source: `vision.ts:207-306,313-369`, `backend-discovery.ts:44-94`. |
| Auto-describe pipeline extraction | `refactor` | `chat.message` + `tool.execute.after` ~90% duplicate (extract → remember → decide → describe → splice → fallback); "untrusted page-derived data" label written twice (`vision.ts:468,:505`), drift risk. One `autoDescribe({extract, mutate})` pipeline; hooks become adapters. |
| Image intake validation parity | `fix` | trust-boundary gap: path loads get containment + size + MIME (`vision.ts:121-144`); data-URL / file-part path bypasses all three (`vision.ts:371-383`). README claims 10 MB limit universally. One `loadImage(source)` for every source. |
| Config seam (`loadConfig()`) | `refactor` | 14 env vars read across `vision.ts`/`backend-discovery.ts`, some at module load (tests pin env before dynamic import). Stepping stone for the v2 declarative schema — the swap touches one module. |
| Published surface hygiene | `refactor` | 6 test-support exports ship in `dist/vision.d.ts` (`shouldAutoDescribe`, `parseBackends`, `mimeOf`, `contains`, `errorMessage`, `describe`); `backend-discovery`/`main-model-capability` unreachable via exports map; dead `BackendCandidate.providerID`. |
| `ocr` + `analyze` tools alongside `vision` | `feat` | prior art [`opencode-vision-plugin`](https://github.com/AshutoshGitMirror/opencode-vision-plugin) |
| More cloud providers (Gemini, OpenAI, Anthropic, NVIDIA NIM, Groq, OpenRouter) | `feat` | additive; lands on the fallback seam (backlog row above) |
| Standalone CLI (`screenshot-vision describe image.png`) | `feat` | additive; can land as a minor once v2 exists |
| Port to Claude Code, Codex CLI, other harnesses | `feat` | additive integrations |
| Validate inline capture against MCP servers with unusual screenshot tool names | `fix`/`feat` | as encountered |

## Doc hygiene (unversioned)

| Item | Type | Note |
|---|---|---|
| Default model mismatch | `docs` | README says `gemma4:e4b` (README:59,96,177); smoke script + AGENTS.md say `qwen3-vl:4b-instruct` (`scripts/smoke-vision.ts:9`). |
| Typecheck scope | `fix` | `tsconfig.json` includes only `vision.ts` + `vision.test.ts`; integration/discovery/tracker/smoke files untyped by `bun run typecheck`. |
| Diary test count | `docs` | DEVELOPER_DIARY.md says "36 pass"; suite now 57 (`23+14+12+8`). |

## v2.0.0 — breaking config change

| Item | Type |
|---|---|
| Declarative config schema that replaces the env-var config (with a migration note) | `feat!` (BREAKING CHANGE) |

Rationale: the first change that breaks existing users (env vars stop working) → MAJOR. Everything that must not break users stays in v1.x. This is the only planned breaking change so far. Stepping stone: the `loadConfig()` seam in Backlog.
