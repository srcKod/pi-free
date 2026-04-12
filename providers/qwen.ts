/**
 * Qwen OAuth Provider Extension
 *
 * Provides free access to Qwen 3.6 Plus via OAuth device flow.
 * 1,000 free API calls/day — run /login qwen to authenticate.
 *
 * Usage:
 *   pi install git:github.com/apmantza/pi-free
 *   # Then /login qwen, select qwen model
 */

import type { OAuthCredentials, Model, Api } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { PROVIDER_QWEN, URL_QWEN_TOS } from "../constants.ts";
import {
	enhanceWithCI,
	type StoredModels,
	setupProvider,
	createReRegister,
} from "../provider-helper.ts";
import { incrementRequestCount } from "../usage/metrics.ts";
import { logWarning } from "../lib/util.ts";
import { createLogger } from "../lib/logger.ts";
import { loginQwen, refreshQwenToken, getQwenBaseUrl } from "./qwen-auth.ts";
import { fetchQwenModels, fetchQwenLiveModels } from "./qwen-models.ts";

const _logger = createLogger("qwen");

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

// =============================================================================
// Extension entry point
// =============================================================================

export default async function (pi: ExtensionAPI) {
	// Fetch static free-tier models
	let models = await fetchQwenModels().catch((err) => {
		logWarning("qwen", "Failed to load models at startup", err);
		return [];
	});

	if (models.length === 0) {
		logWarning("qwen", "No models available, skipping provider");
		return;
	}

	const stored: StoredModels = { free: models, all: models };

	// OAuth config for Qwen
	const oauthConfig = {
		name: "Qwen",
		login: loginQwen,
		refreshToken: refreshQwenToken,
		getApiKey: (cred: OAuthCredentials) => cred.access,
		modifyModels: async (models: Model<Api>[], cred: OAuthCredentials) => {
			const baseUrl = getQwenBaseUrl(cred);
			_logger.info("Qwen OAuth modifyModels called", {
				baseUrl,
				defaultBaseUrl: DEFAULT_BASE_URL,
				modelCount: models.length,
				hasAccessToken: !!cred.access,
				hasResourceUrl: !!cred.resource_url,
			});

			// Resolve the real model ID from the live API
			const resolved = await fetchQwenLiveModels(baseUrl, cred.access, models as any);

			if (baseUrl === DEFAULT_BASE_URL) return resolved;
			return (resolved as Model<Api>[]).map((m) => ({ ...m, baseUrl }));
		},
	};

	// Register provider with OpenAI-compatible API
	function registerProvider(m = models) {
		pi.registerProvider(PROVIDER_QWEN, {
			baseUrl: DEFAULT_BASE_URL,
			apiKey: "QWEN_API_KEY",
			api: "openai-completions" as const,
			headers: {
				"User-Agent": "pi-free",
				"X-DashScope-AuthType": "qwen-oauth",
			},
			models: enhanceWithCI(m),
			oauth: oauthConfig,
		});
	}

	registerProvider();

	// Wire up shared boilerplate (commands, model_select, turn_end, ToS)
	const reRegister = createReRegister(pi, {
		providerId: PROVIDER_QWEN,
		baseUrl: DEFAULT_BASE_URL,
		apiKey: "QWEN_API_KEY",
		oauth: oauthConfig as any,
	});

	setupProvider(
		pi,
		{
			providerId: PROVIDER_QWEN,
			tosUrl: URL_QWEN_TOS,
			initialShowPaid: false,
			reRegister: (m) => {
				reRegister(m);
			},
		},
		stored,
	);

	// Keep lightweight request counting for now (internal only).
	pi.on("turn_end", async (_event, ctx) => {
		if (ctx.model?.provider !== PROVIDER_QWEN) return;
		incrementRequestCount(PROVIDER_QWEN);
	});
}
