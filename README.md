# screenshot-vision

Give a text-only LLM the ability to see screenshots during browser-testing workflows.

## What problem does this solve?

Models like `deepseek-chat` are text-only: they can drive a browser through an MCP server but cannot read the screenshots the browser sends back. When a test step needs to verify what is actually on screen, the model is blind.

`screenshot-vision` is an [OpenCode](https://opencode.ai) plugin that closes this gap. It exposes a single `vision` tool to the model. The model calls that tool, and the tool sends the screenshot to a vision-capable backend and returns a plain-text description. The text-only model never gains vision itself — it just receives a description it can reason over.

## Features

- Single `vision` tool — one call, no new workflow to learn.
- Reads screenshots from two sources: the latest image in the current conversation (Browser MCP inline flow) or a file on disk (Playwright flow).
- Automatic fallback across three backends: local Ollama, then OpenCode Zen free, then Zen paid.
- Direct HTTP calls to the vision backends — bypasses opencode's provider layer, which does not deliver images to Ollama models (verified).
- Built-in safety: prompt-injection defense, path containment, MIME sniffing, a 10 MB size limit, and a 2,048-token output cap.

## How it works

The plugin registers two things when opencode starts:

1. A `vision` tool the model can call.
2. A `tool.execute.after` hook that appends a hint — *"Screenshot captured. Call the `vision` tool to describe it."* — whenever a browser screenshot tool runs, nudging the model to actually read it.

### The two flows

**Browser MCP (inline).** When a browser MCP server captures a screenshot, the image is returned as an inline `data:` URL stored as a file part in the conversation — it never touches disk. Calling `vision` with no arguments reads the most recent image file part from the current session and describes it.

**Playwright (on disk).** When screenshots are saved as files, the model calls `vision` with a `path` argument. The plugin reads and validates that file directly.

Both flows converge on the same `describe` step: encode the image, send it to a backend, and return the text description.

### Fallback chain

Each tier is tried only if the previous one fails with an error or a timeout. The paid tier retries once without the `reasoning` parameter if the API rejects it with HTTP 400 (the backend does not accept `reasoning` in non-reasoning mode).

| Tier | Backend | Model | Cost | Endpoint |
|------|---------|-------|------|----------|
| 1 | Local Ollama | `gemma4:e4b` | Free | `/api/generate` |
| 2 | OpenCode Zen | `mimo-v2.5-free` | Free | `/v1/chat/completions` |
| 3 | OpenCode Zen | `gpt-5-nano` | $0.05 / $0.40 per 1M tokens | `/v1/responses` |

## Requirements

- [OpenCode](https://opencode.ai) (the plugin loads at startup).
- **Local tier:** [Ollama](https://ollama.com) running, with the vision model pulled:

  ```sh
  ollama pull gemma4:e4b
  ```

- **Zen tiers:** an OpenCode Zen connection, configured via `/connect` in opencode (or the equivalent environment variables).

## Install

Copy the plugin into your project's `.opencode/plugins/` directory:

```sh
cp vision.ts <project>/.opencode/plugins/vision.ts
```

Then restart opencode or start a new session. Plugins load at startup.

## Usage

The examples below are written from the point of view of the text-only model driving the browser.

**Browser MCP flow — read the latest inline screenshot:**

```
# The browser MCP captures a screenshot; it appears in the conversation as
# an image the text-only model cannot read. Call vision with no arguments:
vision()
```

The tool finds the most recent image file part in the session and returns a description of what it shows.

**Playwright flow — read a screenshot saved to disk:**

```
# The test runner saves a screenshot to a file. Pass its path:
vision(path="/tmp/opencode/screenshot-123.png")
```

**Ask a specific question about the image:**

```
vision(prompt="Is there a login button visible, and is it enabled?")
```

A `prompt` can be combined with a `path`:

```
vision(path="/tmp/opencode/screenshot-123.png", prompt="List any error messages on the page.")
```

## Configuration

All settings are optional environment variables.

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENCODE_VISION_OLLAMA_MODEL` | `gemma4:e4b` | Local Ollama vision model |
| `OPENCODE_VISION_LOCAL_TIMEOUT_MS` | `90000` | Local request timeout, milliseconds |
| `OPENCODE_VISION_CLOUD_TIMEOUT_MS` | `45000` | Zen request timeout, milliseconds |
| `OPENCODE_VISION_MAX_IMAGE_BYTES` | `10485760` (10 MB) | Max image size for path-based loads |
| `OPENCODE_VISION_USER_AGENT` | Chrome 126 UA | `User-Agent` header sent to Zen |
| `OPENCODE_VISION_ALLOWED_ROOTS` | *(empty)* | Extra directories readable via `path`, separated by the OS path delimiter |
| `OPENCODE_API_KEY` | *(from auth.json)* | Overrides the Zen API key |
| `OPENCODE_AUTH_CONTENT` | *(unset)* | `auth.json` contents provided as an environment string |
| `OPENCODE_AUTH_FILE` | `$XDG_DATA_HOME/opencode/auth.json` | Overrides the auth file path |

## Security

- **Prompt-injection defense.** The system prompt instructs the vision model to treat every instruction visible in a screenshot as untrusted page content: report it, never follow it.
- **Path containment.** The `path` argument is restricted to the session directory, the git worktree, `$TMPDIR/opencode`, and any roots listed in `OPENCODE_VISION_ALLOWED_ROOTS`.
- **MIME sniffing.** Path-based loads are typed from magic bytes (PNG, JPEG, GIF, WebP); unsupported formats are rejected.
- **Size limit.** Images larger than 10 MB are rejected.
- **Output cap.** Every backend is limited to 2,048 output tokens.

## Troubleshooting / Caveats

- **Zen balance.** The paid tier returns `401 CreditsError` when the workspace has insufficient balance.
- **Zen free rate limit.** `mimo-v2.5-free` can return `429` under load.
- **Cloudflare.** Zen requests must send a browser `User-Agent`; this is set by default.
- **`gpt-5-nano` vision.** Not yet verified at runtime — treat the paid tier as unproven until exercised.

When all three backends fail, the `vision` tool reports each failure in a single error message.

## License

MIT. See the `LICENSE` file for the full text.

> **Note:** the `LICENSE` file is not yet present in the repository. Add it before publishing.

## Contributing

Contributions are welcome. Please open an issue to discuss a change before submitting a pull request, and keep the fallback chain and security behavior in mind when modifying the vision call path.

## Acknowledgments

Built on [OpenCode](https://opencode.ai) and its plugin API, with vision provided by Ollama and OpenCode Zen.
