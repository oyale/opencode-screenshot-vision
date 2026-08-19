# screenshot-vision

Custom tool for [OpenCode](https://opencode.ai) that gives a **non-vision LLM** the ability to analyze screenshots and images. The main model calls a single `vision(path)` function and receives a text description — it never needs vision itself.

## Why a custom tool (not a subagent or skill)

| Primitive | What it does | Fits? |
|---|---|---|
| Skill | Instructions injected into the **same** model | No — the main model is still blind |
| Subagent | Another model with an agent loop + duplicated context | Works but heavy (extra tokens, extra reasoning loop) |
| **Custom tool** | A function that calls a vision model and returns text | Yes — one call, no loop, no duplicated context |

The `description` in the tool schema tells the model when to use it, so no skill is needed.

## Fallback chain

Each tier runs only if the previous one fails with an **error** or **timeout** (30 s per request, enforced with `AbortController`).

| Tier | Model | Cost | Endpoint |
|---|---|---|---|
| 1. Local | `ollama/gemma4:e4b` | Free | Ollama `/api/generate` |
| 2. Zen Free | `opencode/mimo-v2.5-free` | Free | Zen `/v1/chat/completions` |
| 3. Zen Paid | `opencode/gpt-5-nano` | $0.05 / $0.40 per 1M | Zen `/v1/responses` |

`gpt-5-nano` is the cheapest vision-capable model on Zen.

## Prompt

The default prompt is scoped to screenshots taken during automated browser tests run by an LLM: it asks for verbatim text, UI elements, layout, and errors/warnings, and forbids speculation.

## Install

Copy the tool into any OpenCode project:

```sh
cp vision.ts <project>/.opencode/tools/vision.ts
```

The filename becomes the tool name (`vision`).

## Prerequisites

- `ollama` running with `gemma4:e4b` pulled: `ollama pull gemma4:e4b`
- OpenCode Zen connected (`/connect`), key stored in `~/.local/share/opencode/auth.json`

## Caveats

- **Zen balance**: the paid tier returns `401 CreditsError` when the Zen workspace has insufficient balance.
- **Zen free tier is rate-limited**: `mimo-v2.5-free` can return `429`.
- **Cloudflare**: Zen requests must send a browser `User-Agent`, otherwise Cloudflare blocks with error 1010.
- **Image format**: MIME is guessed from the file extension (png/jpg/webp/gif).

## Alternatives for the paid tier

If `gpt-5-nano` proves too weak for screenshots, swap the third backend:

- `opencode/gemini-3.5-flash-lite` — $0.30 / $2.50, guaranteed vision, Google endpoint.
- `opencode/minimax-m3` — $0.30 / $1.20, reuses the `chat/completions` backend (`zenChat`).
