/**
 * Qwen OAuth model definitions.
 *
 * Free tier provides Qwen 3.6 Plus (coder-model) with 1,000 requests/day.
 */

import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { createLogger } from "../lib/logger.ts";

const _logger = createLogger("qwen-models");

/**
 * DashScope compatibility settings for Qwen models.
 *
 * DashScope's OpenAI-compatible API does NOT support several parameters
 * that the pi framework sends by default. Without these overrides, the
 * API returns 400 "Unrecognized request argument" errors.
 *
 * - store: false              → not supported (omit entirely)
 * - max_completion_tokens      → use max_tokens instead
 * - stream_options.usage      → not supported
 * - developer role            → not supported (use system)
 * - reasoning_effort          → not supported
 */
const DASHSCOPE_COMPAT: NonNullable<ProviderModelConfig["compat"]> = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	supportsUsageInStreaming: false,
	maxTokensField: "max_tokens",
};

export const QWEN_FREE_MODELS: ProviderModelConfig[] = [
	{
		id: "coder-model",
		name: "Qwen 3.6 Plus (Coder) — Free 1k/day",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 131_072,
		maxTokens: 16_384,
		compat: DASHSCOPE_COMPAT,
	},
];

/**
 * Fetch Qwen models. For OAuth free tier, the model list is static.
 */
export async function fetchQwenModels(): Promise<ProviderModelConfig[]> {
	_logger.info("Qwen OAuth: using static free tier models");
	return QWEN_FREE_MODELS;
}
