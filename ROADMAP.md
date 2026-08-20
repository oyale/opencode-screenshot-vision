# Roadmap

Versioned plan for `opencode-screenshot-vision`. Items are grouped by release and tagged with their [Conventional Commits](https://www.conventionalcommits.org) type, so the [SemVer](https://semver.org) bump and the changelog entry are already decided.

## Versioning policy

- **SemVer**: `MAJOR.MINOR.PATCH`.
- **Conventional Commits** drive the bump: `feat:` → MINOR, `fix:` → PATCH, `feat!:`/`fix!:` (or a `BREAKING CHANGE:` footer) → MAJOR.
- **CHANGELOG.md** follows [Keep a Changelog](https://keepachangelog.com): an `Unreleased` section accumulates changes, then becomes a dated release entry on tag.
- Each item below lists its commit type, so "what to write in the changelog" is settled ahead of time.

## v1.0.0 / v1.1.0 — shipped (published as `opencode-screenshot-vision@1.1.0`)

Done so far:

- `vision` tool with browser-screenshot capture, pasted-image capture, and file mode.
- Local-first fallback chain (local OpenAI-compatible runtime → Zen free → Zen paid).
- Prompt-injection defense, path containment, MIME sniffing, size/token limits.
- Build to `dist/` with CI (typecheck + test + build), `CHANGELOG.md`, release-please, and OIDC publish workflow.
- Local OpenAI-compatible backend (`/v1/chat/completions` + configurable URL), so LM Studio, llama.cpp server, and vLLM work alongside Ollama.
- README, LICENSE, `package.json`.

## v1.1.0 — remaining features (backward-compatible)

| Item | Type | Prior art |
|---|---|---|
| Config-block overrides for provider/model/timeout (env vars kept as fallback) | `feat` | — |
| `ocr` + `analyze` tools alongside `vision` | `feat` | [`opencode-vision-plugin`](https://github.com/AshutoshGitMirror/opencode-vision-plugin) |
| Auto-transparent pasted images (replace with text before the model sees it) | `feat` | [`opencode-vision-fallback`](https://github.com/TudeOrangBiasa/opencode-vision-fallback) |

Rationale: all additive — existing users see no change unless they opt in. `feat` → MINOR.

## v1.2.0 — widening (backward-compatible)

| Item | Type |
|---|---|
| Backend interface abstraction (URL + auth + adapter per API family) | `refactor` |
| Auto-discover a vision-capable model from configured providers | `feat` |
| More cloud providers (Gemini, OpenAI, Anthropic, NVIDIA NIM, Groq, OpenRouter) | `feat` |

Rationale: the interface is internal (no breaking change), and each new backend is additive. `refactor`/`feat` → MINOR. Auto-discovery borrows from [`opencode-vision`](https://github.com/WeZZard/opencode-vision).

## v2.0.0 — breaking config change

| Item | Type |
|---|---|
| Declarative config schema that replaces the env-var config (with a migration note) | `feat!` (BREAKING CHANGE) |

Rationale: the first change that breaks existing users (env vars stop working) → MAJOR. Everything that must not break users stays in v1.x. This is the only planned breaking change so far.

## v2.x / unbounded

| Item | Type | Note |
|---|---|---|
| Standalone CLI (`screenshot-vision describe image.png`) | `feat` | additive; can land as a minor once v2 exists |
| Port to Claude Code, Codex CLI, other harnesses | `feat` | additive integrations |
| Validate inline capture against MCP servers with unusual screenshot tool names | `fix`/`feat` | as encountered |
