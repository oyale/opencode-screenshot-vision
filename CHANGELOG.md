# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-20

### Added

- `vision` tool that lets a text-only model read screenshots.
- Three input sources: browser-screenshot capture (`tool.execute.after`), pasted/dropped images (`chat.message`), and a file path.
- Local-first fallback chain: Ollama → OpenCode Zen free → Zen paid, on error or timeout.
- Prompt-injection defense, path containment, magic-byte MIME sniffing, a size limit, and an output-token cap.
- Environment-variable configuration for model, timeouts, size limit, and allowed roots.

[1.0.0]: https://github.com/oyale/opencode-screenshot-vision/releases/tag/v1.0.0
