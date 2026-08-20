# Roadmap

This is the plan for v2 of `opencode-screenshot-vision`. It borrows ideas from the prior-art vision plugins rather than reinventing them. Priorities are rough: **now** (should ship with the next release), **soon** (next feature iteration), **later** (nice-to-have).

## v2 items

### Transpile to `dist/` + CI before publishing — **now**

The package currently ships the raw `vision.ts` source file and lists it directly in `files`/`exports`. Before publishing to npm, build to a `dist/` directory and add a CI step that runs the build and tests before publish.

Rationale: consumers should depend on a built artifact, not a TypeScript source file, and a CI gate makes sure the published package always corresponds to a working build.

### Config-block overrides for provider/model/timeout — **now**

Move configuration from environment variables into a per-project OpenCode config block (with the env vars retained as fallbacks), covering provider, model, and timeouts.

Rationale: environment variables are global and easy to miss; a config block makes per-project overrides discoverable and reviewable, matching how the rest of OpenCode is configured.

### Auto-discover a vision-capable model — **soon**

Instead of a hardcoded fallback chain, detect a vision-capable model from the user's configured providers and use it first.

Rationale: this is what [`opencode-vision`](https://github.com/WeZZard/opencode-vision) already does well — it registers from the user's existing image-capable models. Auto-discovery removes the need to pull a specific Ollama model or connect Zen, and works with whatever the user already has.

### Auto-transparent handling for pasted images — **soon**

Pasted images already work through the manual path (the `chat.message` hook captures them, and the model calls `vision()`). What remains is the auto-transparent step: adopt the `messages.transform` approach from [`opencode-vision-fallback`](https://github.com/TudeOrangBiasa/opencode-vision-fallback) to replace a pasted image with a text description before the main model sees it, so no manual call is needed.

Rationale: the manual path already closes the gap; the auto-replacement removes the last bit of friction. It complements, rather than replaces, the browser-MCP capture — browser screenshots arrive via raw tool results, not the message pipeline.

### OCR + analyze tools — **later**

Add dedicated `ocr` (verbatim text extraction) and `analyze` (structured UI analysis) tools alongside `vision`, modeled on [`opencode-vision-plugin`](https://github.com/AshutoshGitMirror/opencode-vision-plugin).

Rationale: `vision` produces a general description, but browser-testing workflows often need verbatim text (to match expected copy) or structured UI state (to assert on elements). Separate tools give the model finer-grained, more predictable output than one prompt can.

## Widening — serve more people

Beyond v2 features, widen the surface progressively so the same value reaches more users. The enabler is the first item; the rest follow from it.

### Backend interface abstraction — **now** (enabler)

Define a small backend interface: URL, auth, and a request/response adapter per API family (Ollama native, OpenAI-compatible chat, OpenAI responses, Google generateContent). Each backend becomes one config entry, not code.

Rationale: widening is a configuration problem once the interface exists. Adding a provider must not mean editing the plugin.

### More local backends (OpenAI-compatible) — **soon**

Ollama is the only local backend today. Add anything that speaks OpenAI-compatible `/v1/chat/completions`: LM Studio, llama.cpp server, vLLM, SGLang, Jan, LocalAI.

Rationale: most local runtimes already expose that endpoint, so one adapter covers nearly all of them.

### More cloud providers — **soon**

Today the cloud path is OpenCode Zen only. Add direct Gemini, OpenAI, Anthropic, NVIDIA NIM, Groq, and OpenRouter.

Rationale: users already hold API keys for these providers; they should not be forced into a Zen account. Cost stays controlled by whatever fallback order the user configures.

### More agent platforms — **later**

Today the plugin targets the OpenCode plugin API only. Extract the core (image → description, with fallback) and expose it as a standalone CLI, then adapt it to Claude Code, Codex CLI, and other harnesses.

Rationale: the need — a text-only model that cannot read screenshots — exists in every agent runtime. The core is portable; only the integration layer differs. A `screenshot-vision describe image.png` CLI would serve every harness at once.

### More screenshot sources — **later**

Today: BrowserMCP and Playwright files. Add Chrome DevTools MCP, Puppeteer, Selenium, and any tool that writes a PNG or returns base64.

Rationale: a path or a base64 blob is enough input — do not couple the tool to one browser driver.
