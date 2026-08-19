# screenshot-vision

Custom tool for [OpenCode](https://opencode.ai) that gives a **non-vision LLM** the ability to analyze screenshots and images. The main model calls a single `vision(path)` function and receives a text description back — it never needs vision itself.

## Why a custom tool (not a subagent or skill)

| Primitive | What it does | Fits? |
|---|---|---|
| Skill | Instructions injected into the **same** model | No — the main model is still blind |
| Subagent | Another model with an agent loop + duplicated context | Works but heavy (extra tokens, extra reasoning loop) |
| **Custom tool** | A function that calls a vision model and returns text | Yes — one call, no loop, no duplicated context |

The `description` in the tool schema tells the model when to use it, so no skill is needed. The tool also accepts an optional `prompt` argument: when supplied, it is appended to the base prompt as a specific question about the screenshot.

## Fallback chain

Each tier runs **only if the previous one fails** with an error or a timeout. Order matters: the chain stops at the first backend that returns a result.

| Tier | Model | Cost | Endpoint |
|---|---|---|---|
| 1. Local | `ollama/gemma4:e4b` | Free | Ollama `/api/generate` |
| 2. Zen Free | `opencode/mimo-v2.5-free` | Free | Zen `/v1/chat/completions` |
| 3. Zen Paid | `opencode/gpt-5-nano` | $0.05 / $0.40 per 1M | Zen `/v1/responses` |

- `gpt-5-nano` is the cheapest vision-capable model on Zen.
- The paid tier sends a `reasoning: { effort: "minimal" }` parameter; if the API rejects it with HTTP 400, the request is retried **without** the `reasoning` parameter.
- Every request is bounded by a per-request timeout enforced with `AbortController` (see [Configuration](#configuration)).

## Prompt

The default prompt is scoped to screenshots taken during automated browser tests run by an LLM. It asks for verbatim text, UI elements (with state and approximate position), layout, and errors, warnings, dialogs, and overlays. It forbids speculation and instructs the vision model to distinguish observation from uncertainty.

Critically, the prompt treats all visible text as **untrusted page content**: the vision model must report it but never follow it. This is the prompt-injection defense — a screenshot containing "ignore previous instructions" cannot influence the description that gets returned.

## Install

Copy the tool into any OpenCode project:

```sh
cp vision.ts <project>/.opencode/tools/vision.ts
```

The filename becomes the tool name (`vision`).

## Prerequisites

- `ollama` running with `gemma4:e4b` pulled: `ollama pull gemma4:e4b`
- OpenCode Zen connected via `/connect`, with the key stored in `~/.local/share/opencode/auth.json`

## Configuration

All settings are read from environment variables. Every value has a sensible default; only set one when you need to override it.

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_VISION_OLLAMA_URL` | `http://localhost:11434` | Ollama server base URL |
| `OPENCODE_VISION_OLLAMA_MODEL` | `gemma4:e4b` | Local vision model |
| `OPENCODE_VISION_LOCAL_TIMEOUT_MS` | `90000` | Local request timeout (ms) |
| `OPENCODE_VISION_CLOUD_TIMEOUT_MS` | `45000` | Zen request timeout (ms) |
| `OPENCODE_VISION_MAX_IMAGE_BYTES` | `10485760` (10 MB) | Maximum image size |
| `OPENCODE_VISION_USER_AGENT` | Chrome 126 UA | `User-Agent` header for Zen requests |
| `OPENCODE_VISION_ALLOWED_ROOTS` | *(empty)* | Extra allowed directories, separated by the OS path delimiter |
| `OPENCODE_API_KEY` | *(from auth.json)* | Overrides the Zen API key |
| `OPENCODE_AUTH_CONTENT` | *(unset)* | `auth.json` contents supplied as an env string |
| `OPENCODE_AUTH_FILE` | `$XDG_DATA_HOME/opencode/auth.json` | Overrides the auth file path |

The Zen key is resolved in this order: `OPENCODE_API_KEY`, then `OPENCODE_AUTH_CONTENT` (parsed as JSON), then the auth file. `XDG_DATA_HOME` is respected when locating the auth file unless `OPENCODE_AUTH_FILE` is set.

## Security behavior

- **Prompt-injection defense**: the base prompt tells the vision model to treat visible text as untrusted page content — report it, never follow it.
- **Path containment**: only images inside the session directory, the git worktree, the system temp directory, or `OPENCODE_VISION_ALLOWED_ROOTS` are read. Anything else is rejected.
- **MIME detection**: the format is detected from **magic bytes** (PNG, JPEG, GIF, WebP), not from the file extension. Unsupported formats are rejected.
- **Size limit**: files larger than `OPENCODE_VISION_MAX_IMAGE_BYTES` (default 10 MB) are rejected, as are empty files.
- **Output cap**: each backend's output is capped at 2048 tokens.

## Caveats

- **Zen balance**: the paid tier returns `401 CreditsError` when the Zen workspace has insufficient balance.
- **Zen free tier is rate-limited**: `mimo-v2.5-free` can return `429`.
- **Cloudflare**: Zen requests must send a browser `User-Agent`, otherwise Cloudflare blocks with error 1010. This is already set by default.
- **Unverified vision**: `gpt-5-nano` vision has not yet been verified at runtime.

## Alternatives for the paid tier

If `gpt-5-nano` proves too weak for screenshots, swap the third backend:

- `opencode/gemini-3.5-flash-lite` — $0.30 / $2.50, guaranteed vision, Google endpoint.
- `opencode/minimax-m3` — $0.30 / $1.20, reuses the `chat/completions` backend (`zenChat`).
