# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0](https://github.com/oyale/opencode-screenshot-vision/compare/v1.4.1...v1.5.0) (2026-08-28)


### Features

* discover and order vision backends from configured providers ([2fb7b68](https://github.com/oyale/opencode-screenshot-vision/commit/2fb7b68d6cd0fc485c76d9303bbfa2f88cd56f6e))
* skip auto-describe when the main model sees, discover backends ([587e32b](https://github.com/oyale/opencode-screenshot-vision/commit/587e32b773c708b6d5a7d5e5df4c82e5fad2e58b))
* track main model vision capability per session ([e55c9cf](https://github.com/oyale/opencode-screenshot-vision/commit/e55c9cf6bad52ea929dbd367d54116aa6e4ff3cc))


### Bug Fixes

* guard malformed discovery models, test describe fallback, cloud timeout ([c5fcb35](https://github.com/oyale/opencode-screenshot-vision/commit/c5fcb35beed6f9adfcad6c14ceb960703ca99b2c))

## [1.4.1](https://github.com/oyale/opencode-screenshot-vision/compare/v1.4.0...v1.4.1) (2026-08-27)


### Bug Fixes

* mint valid TextPart metadata in chat.message auto-description ([6f8644b](https://github.com/oyale/opencode-screenshot-vision/commit/6f8644babce2a4738ff83a2d87b168294aebf709))

## [1.4.0](https://github.com/oyale/opencode-screenshot-vision/compare/v1.3.0...v1.4.0) (2026-08-26)


### Features

* auto-describe pasted/dropped images too ([eba25c9](https://github.com/oyale/opencode-screenshot-vision/commit/eba25c999552781f65090a29e97ee9b8cb7bcfa6))

## [1.3.0](https://github.com/oyale/opencode-screenshot-vision/compare/v1.2.1...v1.3.0) (2026-08-26)


### Features

* auto-describe screenshots (append/replace/off via OPENCODE_VISION_AUTO_MODE) ([90be5c3](https://github.com/oyale/opencode-screenshot-vision/commit/90be5c339f0bfa89f2e711e482720e0dd2133d96))

## [1.2.1](https://github.com/oyale/opencode-screenshot-vision/compare/v1.2.0...v1.2.1) (2026-08-26)


### Bug Fixes

* expose server entrypoint so opencode loads the plugin ([2c872ea](https://github.com/oyale/opencode-screenshot-vision/commit/2c872ea7bcd062fbe908fad3666a28ef1aa2cff0))

## [1.2.0](https://github.com/oyale/opencode-screenshot-vision/compare/v1.1.0...v1.2.0) (2026-08-20)


### Features

* add GitHub workflows for Dependabot, CodeQL analysis, Node.js CI, and package publishing ([a911cd8](https://github.com/oyale/opencode-screenshot-vision/commit/a911cd8a90ac8948f72e13edf8c017b0a4276f65))
* update release manifest structure for improved package management ([12fac75](https://github.com/oyale/opencode-screenshot-vision/commit/12fac7540caeeabc200884914647921d07719c63))


### Bug Fixes

* bound the per-session image cache ([54bbd24](https://github.com/oyale/opencode-screenshot-vision/commit/54bbd24f3e4130f8e98b05a16589a110ab9dde9b))
* update Node.js CI workflow to support Node.js 24 and improve install process ([d464fe7](https://github.com/oyale/opencode-screenshot-vision/commit/d464fe7584282b59d968a83ac19237edf7c129c2))

## [1.1.0](https://github.com/oyale/opencode-screenshot-vision/compare/v1.0.0...v1.1.0) (2026-08-20)


### Features

* add debug logging and improve image handling in VisionPlugin ([689a909](https://github.com/oyale/opencode-screenshot-vision/commit/689a9097cc8a7810e1961cb5011bb28230b8c02f))
* add GitHub workflows for Dependabot, CodeQL analysis, Node.js CI, and package publishing ([a911cd8](https://github.com/oyale/opencode-screenshot-vision/commit/a911cd8a90ac8948f72e13edf8c017b0a4276f65))
* add isHttpError function to improve error type checking in HTTP responses ([d9330b2](https://github.com/oyale/opencode-screenshot-vision/commit/d9330b2eea36938dc2178f03ac36049dc770b8d2))
* add MIT License to the project ([80d0f4e](https://github.com/oyale/opencode-screenshot-vision/commit/80d0f4e5facd22a114e64af58b9bad0de968d7a7))
* recommend sequential retries when all vision backends fail ([a1eb410](https://github.com/oyale/opencode-screenshot-vision/commit/a1eb410a951e235697451689718bd20d597d570c))
* support pasted/dropped images; soften provider claim ([3609c7e](https://github.com/oyale/opencode-screenshot-vision/commit/3609c7e27d71aacb5e10c14a4d53006d0f7c7a32))
* update release manifest structure for improved package management ([12fac75](https://github.com/oyale/opencode-screenshot-vision/commit/12fac7540caeeabc200884914647921d07719c63))
* use OpenAI-compatible local backend with configurable URL ([7a001fe](https://github.com/oyale/opencode-screenshot-vision/commit/7a001fefe9edb0bdb4cb815de53be1022ed4a3d0))
* **vision:** add plugin-based conversation image support, typed errors, and safer path checks ([0374b93](https://github.com/oyale/opencode-screenshot-vision/commit/0374b938920de8fdadce587b843df882d5e9f802))


### Bug Fixes

* bound the per-session image cache ([54bbd24](https://github.com/oyale/opencode-screenshot-vision/commit/54bbd24f3e4130f8e98b05a16589a110ab9dde9b))
* capture browser screenshot image from raw MCP tool result ([72e9233](https://github.com/oyale/opencode-screenshot-vision/commit/72e92330ee2007988de9454e1f9d229fe4e4b89e))
* update Node.js CI workflow to support Node.js 24 and improve install process ([d464fe7](https://github.com/oyale/opencode-screenshot-vision/commit/d464fe7584282b59d968a83ac19237edf7c129c2))

## 1.1.1 (2026-08-20)


### Bug Fixes

* bound the per-session image cache ([54bbd24](https://github.com/oyale/opencode-screenshot-vision/commit/54bbd24f3e4130f8e98b05a16589a110ab9dde9b))

## 1.1.0 (2026-08-20)


### Features

* add debug logging and improve image handling in VisionPlugin ([689a909](https://github.com/oyale/opencode-screenshot-vision/commit/689a9097cc8a7810e1961cb5011bb28230b8c02f))
* add isHttpError function to improve error type checking in HTTP responses ([d9330b2](https://github.com/oyale/opencode-screenshot-vision/commit/d9330b2eea36938dc2178f03ac36049dc770b8d2))
* add MIT License to the project ([80d0f4e](https://github.com/oyale/opencode-screenshot-vision/commit/80d0f4e5facd22a114e64af58b9bad0de968d7a7))
* recommend sequential retries when all vision backends fail ([a1eb410](https://github.com/oyale/opencode-screenshot-vision/commit/a1eb410a951e235697451689718bd20d597d570c))
* support pasted/dropped images; soften provider claim ([3609c7e](https://github.com/oyale/opencode-screenshot-vision/commit/3609c7e27d71aacb5e10c14a4d53006d0f7c7a32))
* use OpenAI-compatible local backend with configurable URL ([7a001fe](https://github.com/oyale/opencode-screenshot-vision/commit/7a001fefe9edb0bdb4cb815de53be1022ed4a3d0))
* **vision:** add plugin-based conversation image support, typed errors, and safer path checks ([0374b93](https://github.com/oyale/opencode-screenshot-vision/commit/0374b938920de8fdadce587b843df882d5e9f802))


### Bug Fixes

* capture browser screenshot image from raw MCP tool result ([72e9233](https://github.com/oyale/opencode-screenshot-vision/commit/72e92330ee2007988de9454e1f9d229fe4e4b89e))

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
