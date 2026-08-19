# screenshot-vision

Plugin for [OpenCode](https://opencode.ai) that gives a **non-vision LLM** the ability to understand screenshots. The text model calls a single `vision` tool and receives a text description — it never needs vision itself.

Built for the browser-MCP flow: the text model drives the browser, the browser MCP returns screenshots **inline** (they never touch disk), and `vision` reads the latest screenshot straight out of the conversation.

## Why a plugin (not a tool, subagent, or skill)

| Primitive | What it does | Fits? |
|---|---|---|
| Skill | Instructions injected into the **same** model | No — the model is still blind |
| Subagent | Another model + agent loop + duplicated context | Heavy |
| Standalone tool (`.opencode/tools/`) | Function the model calls | Can't read conversation image parts (no SDK `client`) |
| **Plugin tool (`.opencode/plugins/`)** | Function with SDK `client` access | Yes — reads the screenshot from the session |

Browser MCP (`@browsermcp/mcp`) returns screenshots as inline base64, which opencode stores as a file part in the conversation. Only a plugin can reach those parts via `client.session.messages`.

## How the model uses it

1. The browser MCP captures a screenshot → the text model receives an image it cannot read.
2. A `tool.execute.after` hook appends: *"Screenshot captured. Call the `vision` tool to describe it."*
3. The model calls `vision` with **no arguments** → the tool finds the most recent image part in the session, sends it to a vision backend, and returns the description.

Optionally the model may pass a file path (`vision(path="/tmp/x.png")`) or a specific question (`vision(prompt="...")`).

## Fallback chain

Each tier runs only if the previous fails with an error **or** a timeout (per-request, `AbortController`).

| Tier | Model | Cost | Endpoint |
|---|---|---|---|
| 1. Local | `ollama/gemma4:e4b` | Free | Ollama `/api/generate` |
| 2. Zen Free | `opencode/mimo-v2.5-free` | Free | Zen `/v1/chat/completions` |
| 3. Zen Paid | `opencode/gpt-5-nano` | $0.05 / $0.40 per 1M | Zen `/v1/responses` |

- The vision call is a **direct HTTP call**, not the opencode provider layer — opencode's internal ollama path does not deliver images (verified).
- The paid tier retries without `reasoning` if the API rejects it with HTTP 400.

## Install

```sh
cp vision.ts <project>/.opencode/plugins/vision.ts
```

Restart opencode (or start a new session) so the plugin loads. Plugins load at startup.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_VISION_OLLAMA_MODEL` | `gemma4:e4b` | Local vision model |
| `OPENCODE_VISION_LOCAL_TIMEOUT_MS` | `90000` | Local request timeout (ms) |
| `OPENCODE_VISION_CLOUD_TIMEOUT_MS` | `45000` | Zen request timeout (ms) |
| `OPENCODE_VISION_MAX_IMAGE_BYTES` | `10485760` (10 MB) | Max image size for path-based loads |
| `OPENCODE_VISION_USER_AGENT` | Chrome 126 UA | `User-Agent` header for Zen requests |
| `OPENCODE_VISION_ALLOWED_ROOTS` | *(empty)* | Extra dirs readable via `path`, OS-delimiter separated |
| `OPENCODE_API_KEY` | *(from auth.json)* | Overrides the Zen API key |
| `OPENCODE_AUTH_CONTENT` | *(unset)* | `auth.json` contents as an env string |
| `OPENCODE_AUTH_FILE` | `$XDG_DATA_HOME/opencode/auth.json` | Overrides the auth file path |

## Security behavior

- **Prompt-injection defense**: the base prompt tells the vision model to treat visible text as untrusted page content — report it, never follow it.
- **Path containment**: the optional `path` argument is restricted to the session directory, git worktree, `$TMPDIR/opencode`, or `OPENCODE_VISION_ALLOWED_ROOTS`.
- **MIME detection**: magic bytes (PNG/JPEG/GIF/WebP) for path-based loads; conversation images reuse the part's declared MIME.
- **Output cap**: 2048 tokens per backend.

## Prerequisites

- `ollama` running with `gemma4:e4b` pulled: `ollama pull gemma4:e4b`
- OpenCode Zen connected via `/connect` (for the fallback tiers)

## Caveats

- **Zen balance**: the paid tier returns `401 CreditsError` when the workspace has insufficient balance.
- **Zen free tier is rate-limited**: `mimo-v2.5-free` can return `429`.
- **Cloudflare**: Zen requests must send a browser `User-Agent` (set by default).
- **`gpt-5-nano` vision** not yet verified at runtime.

## Alternatives for the paid tier

- `opencode/gemini-3.5-flash-lite` — $0.30 / $2.50, guaranteed vision, Google endpoint.
- `opencode/minimax-m3` — $0.30 / $1.20, reuses the `chat/completions` backend.
