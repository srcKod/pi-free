/**
 * Global Provider Registry for pi-free.
 *
 * Decoupled from index.ts so providers can import toggle logic
 * without creating a circular dependency.
 */

import type {
	ExtensionAPI,
	ProviderModelConfig,
} from "@mariozechner/pi-coding-agent";
import { getFreeOnly, saveConfig } from "../config.ts";
import { createLogger } from "./logger.ts";

const _logger = createLogger("pi-free");

// =============================================================================
// Types
// =============================================================================

interface ProviderEntry {
	id: string;
	stored: { free: ProviderModelConfig[]; all: ProviderModelConfig[] };
	reRegister: (models: ProviderModelConfig[]) => void;
	hasKey: boolean;
}

// =============================================================================
// State
// =============================================================================

const providerRegistry = new Map<string, ProviderEntry>();
let globalFreeOnly = getFreeOnly();

// Providers that expose actual per-model pricing via API
const PRICING_EXPOSED_PROVIDERS = new Set([
	"openrouter",
	"opencode",
	"kilo",
	"cline",
]);

// =============================================================================
// Free-model detection
// =============================================================================

/**
 * Check if a model is free.
 *
 * For providers with pricing APIs: uses cost (input === 0 && output === 0)
 * For providers without pricing: ONLY uses name-based check (name includes "free")
 */
export function isFreeModel(
	model: ProviderModelConfig & { provider?: string },
): boolean {
	const provider = model.provider;
	const hasPricing = provider && PRICING_EXPOSED_PROVIDERS.has(provider);

	// For providers WITH pricing API: cost-based check
	if (hasPricing) {
		if ((model.cost?.input ?? 0) === 0 && (model.cost?.output ?? 0) === 0) {
			return true;
		}
	}

	// For providers WITHOUT pricing API: ONLY name-based check
	if (model.name.toLowerCase().includes("free")) {
		return true;
	}

	return false;
}

// =============================================================================
// Registration
// =============================================================================

/** Register a provider with the global free/paid toggle system */
export function registerWithGlobalToggle(
	providerId: string,
	stored: { free: ProviderModelConfig[]; all: ProviderModelConfig[] },
	reRegister: (models: ProviderModelConfig[]) => void,
	hasKey: boolean = false,
): void {
	providerRegistry.set(providerId, {
		id: providerId,
		stored,
		reRegister,
		hasKey,
	});
	_logger.info(
		`[pi-free] Registered ${providerId} with global toggle (${stored.free.length} free, ${stored.all.length} total)`,
	);
}

/** Get current global free-only state */
export function getGlobalFreeOnly(): boolean {
	return globalFreeOnly;
}

/** Access the raw registry (used by /free-providers command) */
export function getProviderRegistry(): ReadonlyMap<string, ProviderEntry> {
	return providerRegistry;
}

// =============================================================================
// Global filter application
// =============================================================================

export function applyGlobalFilter(_pi: ExtensionAPI, freeOnly: boolean): void {
	globalFreeOnly = freeOnly;
	saveConfig({ free_only: freeOnly });

	for (const [providerId, entry] of providerRegistry) {
		try {
			if (freeOnly) {
				// Show only free models
				if (entry.stored.free.length > 0) {
					entry.reRegister(entry.stored.free);
					_logger.info(
						`[pi-free] ${providerId}: filtered to ${entry.stored.free.length} free models`,
					);
				} else {
					_logger.warn(`[pi-free] ${providerId}: no free models available`);
				}
			} else {
				// Show all models (paid + free)
				const allModels =
					entry.stored.all.length > 0 ? entry.stored.all : entry.stored.free;
				if (allModels.length > 0) {
					entry.reRegister(allModels);
					_logger.info(
						`[pi-free] ${providerId}: showing all ${allModels.length} models`,
					);
				}
			}
		} catch (err) {
			_logger.error(
				`[pi-free] Failed to apply filter to ${providerId}`,
				err instanceof Error ? { error: err.message } : { error: String(err) },
			);
		}
	}
}
