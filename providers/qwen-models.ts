/**
 * Qwen OAuth model definitions.
 *
 * Free tier provides Qwen 3.6 Plus (coder-model) with 1,000 requests/day.
 */

import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { createLogger } from "../lib/logger.ts";

const _logger = createLogger("qwen-models");

/**
 * portal.qwen.ai compatibility settings.
 *
 * portal.qwen.ai's OpenAI-compatible API does not support several parameters
 * that the pi framework sends by default.
 */
const PORTAL_COMPAT: NonNullable<ProviderModelConfig["compat"]> = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	supportsUsageInStreaming: false,
	supportsStrictMode: false,
	maxTokensField: "max_tokens",
};

export const QWEN_FREE_MODELS: ProviderModelConfig[] = [
	{
		id: "coder-model",
		name: "Qwen Coder — Free 1k/day",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 131_072,
		maxTokens: 16_384,
		compat: PORTAL_COMPAT,
	},
];

/**
 * Fetch Qwen models. For OAuth free tier, the model list is static.
 */
export async function fetchQwenModels(): Promise<ProviderModelConfig[]> {
	_logger.info("Qwen OAuth: using static free tier models");
	return QWEN_FREE_MODELS;
}
