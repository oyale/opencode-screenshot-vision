# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-20

### Changed

- The local tier now uses the OpenAI-compatible `/v1/chat/completions` API instead of Ollama's native `/api/generate`, so it works with LM Studio, llama.cpp server, vLLM, and any runtime exposing that endpoint.

### Added

- `OPENCODE_VISION_LOCAL_URL` (default `http://localhost:11434/v1`) to point the local tier at another runtime.
- `OPENCODE_VISION_LOCAL_MODEL` (default `gemma4:e4b`). `OPENCODE_VISION_OLLAMA_MODEL` is still honored as a deprecated alias.

## [1.0.0] - 2026-08-20

### Added

- `vision` tool that lets a text-only model read screenshots.
- Three input sources: browser-screenshot capture (`tool.execute.after`), pasted/dropped images (`chat.message`), and a file path.
- Local-first fallback chain: Ollama → OpenCode Zen free → Zen paid, on error or timeout.
- Prompt-injection defense, path containment, magic-byte MIME sniffing, a size limit, and an output-token cap.
- Environment-variable configuration for model, timeouts, size limit, and allowed roots.

[1.0.0]: https://github.com/oyale/opencode-screenshot-vision/releases/tag/v1.0.0
