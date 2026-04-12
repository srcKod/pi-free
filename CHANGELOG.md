# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.8] - 2026-04-13

### Added
- **Modal provider** — Free access to GLM-5.1 FP8 (128k context, 16k max output) during promotional period (free until April 30, 2026)
  - Requires a free Modal API key (`MODAL_API_KEY` or `modal_api_key` in `~/.pi/free.json`)
  - Model: `zai-org/GLM-5.1-FP8` — 128k context window, 16k max output tokens
- **Qwen provider** — Free access to Qwen Coder (1,000 requests/day) via OAuth device flow
  - Run `/login qwen` to authenticate through Qwen Studio (chat.qwen.ai)
  - Uses `coder-model` alias (maps to Qwen3.6-Plus on the backend)
  - 131k context window, 16k max output tokens, zero cost

### Fixed
- **Qwen OAuth browser launch on Windows** — URLs with `&` query params were truncated by `cmd.exe`'s `&` command separator; switched to `powershell.exe Start-Process` which passes the URL as a literal string
- **Qwen API endpoint** — Replicates qwen-code's `getCurrentEndpoint()` logic: uses `resource_url` from OAuth token response (`dashscope.aliyuncs.com` for Chinese accounts, `portal.qwen.ai` for international), with fallback to `dashscope.aliyuncs.com/compatible-mode/v1`
- **Qwen DashScope headers** — Added all headers required by DashScope's OpenAI-compatible API: `X-DashScope-AuthType: qwen-oauth`, `X-DashScope-CacheControl: enable`, `X-DashScope-UserAgent`, `Client-Code: QwenCode`
- **Qwen modifyModels crash** — `modifyModels` must be synchronous; making it async caused the pi framework to receive a `Promise` instead of a `Model[]`, breaking `ModelRegistry.find()`

## [1.0.5] - 2025-04-03

### Fixed
- **NVIDIA provider non-chat model filtering** (comment/implementation mismatch)
  - Added modalities-based filtering to exclude embedding, speech-to-text, OCR, and image-gen models
  - Filters models where `output` is not `["text"]` (e.g., image generation like `black-forest-labs/flux.1-dev`)
  - Filters models where `input` lacks `"text"` (e.g., OCR like `nvidia/nemoretriever-ocr-v1`, speech-to-text like `openai/whisper-large-v3`)
  - Updated file comment to accurately describe the filtering behavior
  - Added 8 comprehensive unit tests for model filtering logic

## [1.0.4] - 2025-04-03

### Fixed
- **All tests now passing** (127/127)
  - Fixed mock paths in kilo.test.ts, zen.test.ts, ollama.test.ts
  - Fixed createCtxReRegister mocks in zen.test.ts and openrouter.test.ts
  - Fixed cline.test.ts to test actual provider re-registration behavior
  - Added missing DEFAULT_MIN_SIZE_B constant to openrouter mock

### Changed
- **Code quality improvements**
  - Refactored usage modules to break circular dependency (limits.ts ↔ formatters.ts)
  - Created usage/types.ts with shared interfaces (FreeTierLimit, FreeTierUsage)
  - Bumped version to 1.0.4

## [1.0.3] - 2025-04-03

### Changed
- Updated package.json metadata (name, description, keywords, repository URL)
- Updated .npmignore for cleaner publishes

## [1.0.0] - 2024-03-28

### Added
- Initial release with 6 providers: Kilo, Zen, OpenRouter, NVIDIA, Cline, Fireworks
- Free tier usage tracking across all sessions
- Provider failover with model hopping
- Autocompact integration for rate limit recovery
- Usage widget with glimpseui
- Command toggles for free/all model filtering
- Hardcoded benchmark data from Artificial Analysis

### Changed
- **Major refactoring**: Split free-tier-limits.ts into usage/* modules
  - usage/tracking.ts - runtime session tracking
  - usage/cumulative.ts - persistent storage
  - usage/formatters.ts - display formatting
  - 77% line reduction (741 → 166 lines)
- **Major refactoring**: Split usage-widget.ts into widget/* modules
  - widget/data.ts - data collection
  - widget/format.ts - formatting utilities
  - widget/render.ts - HTML generation
  - 74% line reduction (~350 → 90 lines)
- **Refactoring**: Extracted functions from cline-auth.ts
  - fetchAuthorizeUrl() - auth URL fetching
  - waitForAuthCode() - callback handling
  - exchangeCodeForTokens() - token exchange
  - parseManualInput() - manual input parsing
- **Refactoring**: Simplified model-hop.ts complexity
  - Extracted handleDowngradeDecision()
  - Extracted tryAlternativeModel()
- **Deduplication**: Created shared modules
  - lib/json-persistence.ts - file I/O with caching
  - lib/logger.ts - structured logging
  - providers/model-fetcher.ts - OpenRouter-compatible fetching
- Replaced ~30 console.log statements with structured logging
- Fixed all 9 pre-existing test failures
  - fetchWithRetry now throws after last retry
  - Fixed auth pattern matching (added key.*not.*valid)
  - Updated capability ranking tests
  - Added resetUsageStats() for test isolation

### Fixed
- fetchWithRetry() now properly throws after exhausting retries
- Auth error pattern matching now handles more message variants
- Test isolation for free-tier-limits tests
