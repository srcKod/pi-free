/**
 * Qoder Provider Extension
 *
 * Registers the Qoder provider with Pi, providing free access to top-tier
 * LLM models (DeepSeek V4 Pro/Flash, Qwen3.7 Plus/Max, GLM 5.1, Kimi K2.6,
 * MiniMax M3) through Qoder's OpenAI-compatible API.
 *
 * Qoder uses a custom authentication protocol (PAT exchange + COSY signing)
 * and a credits-based pricing model:
 *   - Community Edition (free): basic models with daily message limits
 *   - Pro / Pro+ / Ultra (paid): premium models via monthly credits
 *
 * Usage:
 *   Install pi-free, then run /login qoder to authenticate
 *   (PAT paste or browser OAuth)
 *   /toggle-qoder switches between basic (free-tier) and all models
 *
 * Environment variables:
 *   QODER_PERSONAL_ACCESS_TOKEN — PAT for headless auth (optional)
 *   QODER_PAT                   — Alias for above
 */

import type { Api, OAuthCredentials } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import { BASE_URL_QODER, PROVIDER_QODER } from "../../constants.ts";
import { getQoderShowPaid } from "../../config.ts";
import {
	getCachedModels,
	isBasicModel,
	isCacheStale,
	updateQoderModelsCache,
	type QoderModelConfig,
} from "./models.ts";
import { getCachedCredentials, loginQoder, refreshQoderToken } from "./auth.ts";
import { streamQoder } from "./stream.ts";
import { enhanceWithCI } from "../../provider-helper.ts";
import { registerWithGlobalToggle } from "../../lib/registry.ts";
import { createToggleState } from "../../lib/toggle-state.ts";

// =============================================================================
// Extension Entry Point
// =============================================================================

export default async function qoderProvider(pi: ExtensionAPI) {
	const logger = (await import("../../lib/logger.ts")).createLogger("qoder");

	// Initial model fetch
	let allModels: QoderModelConfig[] = getCachedModels();
	let basicModels: QoderModelConfig[] = allModels.filter(isBasicModel);
	const stored = { free: basicModels, all: allModels };

	const toggleState = createToggleState({
		providerId: PROVIDER_QODER,
		initialShowPaid: getQoderShowPaid(),
		initialModels: stored,
	});

	// ── OAuth config (defined before reRegister so it's always available) ──
	const oauthConfig = {
		name: "Qoder (Browser OAuth / PAT)",
		login: async (callbacks: any): Promise<OAuthCredentials> => {
			const cred = await loginQoder(callbacks);

			// After login, refresh models from API
			try {
				const accessToken = cred.access as string;
				const creds = getCachedCredentials();
				await refreshModels(
					accessToken,
					creds?.userID || "qoder-user",
					creds?.name || "Qoder User",
					creds?.email || "user@qoder.com",
				);
			} catch {
				// Best-effort
			}

			return cred;
		},
		refreshToken: refreshQoderToken,
		getApiKey: (cred: OAuthCredentials) => cred.access,
	};

	// Re-register function — called by toggle, session refresh, login
	const reRegister = (models: ProviderModelConfig[]) => {
		const enhanced = enhanceWithCI(models, PROVIDER_QODER);
		pi.registerProvider(PROVIDER_QODER, {
			baseUrl: BASE_URL_QODER,
			api: "qoder-api" as Api,
			models: enhanced,
			oauth: oauthConfig,
			streamSimple: streamQoder,
		});
	};

	// ── Helper: refresh models from API and re-register ──
	const refreshModels = async (
		accessToken: string,
		userID: string,
		name: string,
		email: string,
	) => {
		await updateQoderModelsCache(accessToken, userID, name, email);
		const fresh = getCachedModels();
		if (fresh.length > 0) {
			allModels = fresh;
			basicModels = fresh.filter(isBasicModel);
			stored.all = allModels;
			stored.free = basicModels;
			reRegister(allModels);
			logger.info(`[qoder] Models refreshed: ${allModels.length}`);
		}
	};

	// Register with global toggle system so it participates in /toggle-free
	registerWithGlobalToggle(PROVIDER_QODER, stored, (m) => reRegister(m), false);

	// Per-provider toggle: /toggle-qoder (basic free-tier ↔ all models)
	pi.registerCommand("toggle-qoder", {
		description: "Toggle between basic (free-tier) and all Qoder models",
		handler: (_args, ctx) => {
			const applied = toggleState.toggle(reRegister);
			const basicCount = stored.free.length;
			const premiumCount = stored.all.length - basicCount;
			if (applied.mode === "all") {
				ctx.ui.notify(
					`qoder: showing all ${stored.all.length} models (${basicCount} basic, ${premiumCount} premium)`,
					"info",
				);
			} else {
				ctx.ui.notify(
					`qoder: showing ${stored.free.length} basic (free-tier) models`,
					"info",
				);
			}
			return Promise.resolve();
		},
	});

	// Initial registration respects the configured show-paid mode.
	toggleState.applyCurrent(reRegister);

	// If user is already authenticated and cache is stale, refresh at startup
	// (mirrors kilo/cline pattern: check cache freshness before hitting network)
	try {
		const cachedCreds = getCachedCredentials();
		if (cachedCreds?.access && isCacheStale()) {
			await refreshModels(
				cachedCreds.access as string,
				cachedCreds.userID || "qoder-user",
				cachedCreds.name || "Qoder User",
				cachedCreds.email || "user@qoder.com",
			);
		}
	} catch {
		// Best-effort: fall back to cached / static models
	}

	// Refresh models cache on session_start if stale (>1h old)
	pi.on("session_start", async (_event, ctx) => {
		try {
			const accessToken =
				await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_QODER);
			if (!accessToken || !isCacheStale()) return;
			const creds = getCachedCredentials();
			await refreshModels(
				accessToken,
				creds?.userID || "qoder-user",
				creds?.name || "Qoder User",
				creds?.email || "user@qoder.com",
			);
		} catch {
			// Best-effort: fall back to existing cache / static models
		}
	});

	logger.info(`[qoder] Provider registered with ${allModels.length} models`);
}

// Re-export key symbols for testing
export { loginQoder, refreshQoderToken, getCachedCredentials, streamQoder };
