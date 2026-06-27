/**
 * Qoder model definitions and cache management.
 *
 * Qoder operates on a credits-based pricing model:
 *   - Community Edition (free): basic models with daily message limits
 *   - Pro / Pro+ / Ultra (paid): premium models via monthly credits
 *
 * The dynamic model list API is currently unavailable (legacy api3 endpoint
 * is decommissioned). We keep a static curated list and classify models as
 * basic (free tier) or premium (paid credits) using `_isBasic`.
 *
 * When the dynamic endpoint returns, `updateQoderModelsCache` will populate
 * the cache; until then, static models are the source of truth.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// Extend ProviderModelConfig to track basic (free-tier) vs premium models
export interface QoderModelConfig extends ProviderModelConfig {
	_isBasic?: boolean;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_PATH = join(homedir(), ".pi", "agent", "qoder-models-cache.json");

const ZERO_COST = Object.freeze({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
});

// ─── Basic (free-tier) model IDs ─────────────────────────────────────────────
// These are the Qoder-branded router models available on Community Edition.
// Named models (DeepSeek, Qwen, GLM, Kimi, MiniMax) are premium and cost credits.
const BASIC_MODEL_IDS = new Set([
	"auto",
	"ultimate",
	"performance",
	"efficient",
	"lite",
]);

// ─── Static model list ───────────────────────────────────────────────────────

/**
 * Static model definitions for Qoder.
 * Basic models (free tier) are marked with _isBasic.
 * Premium models consume credits and require a paid plan.
 *
 * Model IDs are validated against the live api2-v2 endpoint; invalid IDs
 * (dfmodel, gm51model, qmodel_latest) are excluded here.
 */
export const staticModels: QoderModelConfig[] = [
	{
		id: "auto",
		name: "Qoder Auto",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 180_000,
		maxTokens: 32_768,
		_isBasic: true as const,
	},
	{
		id: "ultimate",
		name: "Qoder Ultimate",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		_isBasic: true as const,
	},
	{
		id: "performance",
		name: "Qoder Performance",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		_isBasic: true as const,
	},
	{
		id: "efficient",
		name: "Qoder Efficient",
		reasoning: false,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 180_000,
		maxTokens: 32_768,
		_isBasic: true as const,
	},
	{
		id: "lite",
		name: "Qoder Lite",
		reasoning: false,
		input: ["text"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 180_000,
		maxTokens: 32_768,
		_isBasic: true as const,
	},
	{
		id: "qmodel",
		name: "Qwen3.7 Plus (Qoder)",
		reasoning: false,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		_isBasic: false as const,
	},
	{
		id: "dmodel",
		name: "DeepSeek V4 Pro (Qoder)",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		_isBasic: false as const,
	},
	{
		id: "kmodel",
		name: "Kimi K2.6 (Qoder)",
		reasoning: false,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 256_000,
		maxTokens: 32_768,
		_isBasic: false as const,
	},
	{
		id: "mmodel",
		name: "MiniMax M3 (Qoder)",
		reasoning: false,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		_isBasic: false as const,
	},
];

// ─── Dynamic model API ───────────────────────────────────────────────────────

interface QoderModelEntry {
	key?: string;
	enable?: boolean;
	display_name?: string;
	max_input_tokens?: number;
	max_output_tokens?: number;
	context_config?: Record<string, { token_count?: number }>;
	is_vl?: boolean;
	is_reasoning?: boolean;
	thinking_config?: { enabled?: { efforts?: unknown } };
	source?: string;
	[key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a model is a basic (free-tier) model. */
export function isBasicModel(model: ProviderModelConfig): boolean {
	if ((model as ProviderModelConfig & { _isBasic?: boolean })._isBasic !== undefined) {
		return (model as ProviderModelConfig & { _isBasic: boolean })._isBasic;
	}
	return BASIC_MODEL_IDS.has(model.id);
}

// ─── Cache management ────────────────────────────────────────────────────────

function modelEntryToConfig(
	entry: QoderModelEntry,
): QoderModelConfig | null {
	const key = entry.key;
	if (!key || !entry.enable) return null;

	const display = entry.display_name || key;
	const ctxLen = resolveContextLength(entry);
	const isVL = Boolean(entry.is_vl);
	const isReasoning =
		Boolean(entry.is_reasoning) || Boolean(entry.thinking_config);
	const input: ("text" | "image")[] = isVL ? ["text", "image"] : ["text"];
	const basic = BASIC_MODEL_IDS.has(key);

	return {
		id: key,
		name: display,
		reasoning: isReasoning,
		input,
		cost: ZERO_COST,
		contextWindow: ctxLen,
		maxTokens: entry.max_output_tokens || 32_768,
		_isBasic: basic,
	};
}

function resolveContextLength(entry: QoderModelEntry): number {
	let ctxLen = entry.max_input_tokens || 180_000;
	if (entry.context_config && typeof entry.context_config === "object") {
		for (const val of Object.values(entry.context_config)) {
			if (
				val &&
				typeof val === "object" &&
				typeof (val as Record<string, unknown>).token_count === "number"
			) {
				const tc = (val as Record<string, number>).token_count;
				if (tc > ctxLen) ctxLen = tc;
			}
		}
	}
	return ctxLen;
}

/** Get models from cache, falling back to static models. */
export function getCachedModels(): QoderModelConfig[] {
	if (existsSync(CACHE_PATH)) {
		try {
			const data = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
			if (data && Array.isArray(data.models)) {
				return data.models as QoderModelConfig[];
			}
		} catch {
			// Fall through to static
		}
	}
	return staticModels;
}

/** Check if the local model cache is stale (>1 hour old). */
export function isCacheStale(): boolean {
	if (!existsSync(CACHE_PATH)) return true;
	try {
		const data = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
		if (!data || typeof data.updatedAt !== "number") return true;
		return Date.now() - data.updatedAt > 3_600_000; // 1 hour
	} catch {
		return true;
	}
}

/**
 * Fetch available models from Qoder's dynamic model list API and cache them.
 * Falls back silently if the API is unreachable or the legacy endpoint
 * returns auth errors (COSY signing is currently incompatible with the
 * new api2-v2 inference endpoint).
 */
export async function updateQoderModelsCache(
	_authToken: string,
	_userID: string,
	_name: string,
	_email: string,
): Promise<void> {
	// NOTE: The legacy model list endpoint at api3.qoder.sh requires COSY signing
	// which is incompatible with the api2-v2 inference endpoint we now use.
	// Dynamic model discovery is disabled until Qoder publishes a model list
	// endpoint on api2-v2. Static models in `staticModels` remain the source of truth.
	//
	// If you want to re-enable dynamic discovery, implement COSY signing in
	// stream.ts (like auth.ts does for legacy endpoints) and point this to
	// the correct api2-v2 model-list path.
}

/**
 * Get the cached model config for a specific model key.
 * Used to determine per-model settings (reasoning, max tokens, etc.) at stream time.
 */
export function getCachedModelConfig(
	modelKey: string,
): QoderModelEntry | null {
	if (existsSync(CACHE_PATH)) {
		try {
			const data = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
			if (data?.configs?.[modelKey]) {
				return data.configs[modelKey] as QoderModelEntry;
			}
		} catch {
			// Fall through
		}
	}
	return null;
}
