import { beforeEach, describe, expect, it } from "vitest";
import {
	FREE_TIER_LIMITS,
	getFreeTierUsage,
	getLimitWarning,
	isApproachingLimit,
} from "../usage/limits.ts";
import { formatFreeTierStatus } from "../usage/formatters.ts";
import {
	getModelUsage,
	getProviderModelUsage,
	getSessionUsage,
	getTopModels,
	incrementModelRequestCount,
	resetUsageStats,
} from "../usage/tracking.ts";

describe("Free Tier Limits", () => {
	beforeEach(() => {
		// Reset usage stats before each test
		resetUsageStats();
	});

	describe("FREE_TIER_LIMITS", () => {
		it("should have limits for kilo provider", () => {
			expect(FREE_TIER_LIMITS.kilo).toBeDefined();
			expect(FREE_TIER_LIMITS.kilo.requestsPerHour).toBe(200);
		});

		it("should have limits for openrouter provider", () => {
			expect(FREE_TIER_LIMITS.openrouter).toBeDefined();
			expect(FREE_TIER_LIMITS.openrouter.requestsPerDay).toBe(1000);
		});

		it("should have limits for nvidia provider", () => {
			expect(FREE_TIER_LIMITS.nvidia).toBeDefined();
			expect(FREE_TIER_LIMITS.nvidia.requestsPerMonth).toBe(1000);
		});

		it("should have limits for fireworks provider", () => {
			expect(FREE_TIER_LIMITS.fireworks).toBeDefined();
			expect(FREE_TIER_LIMITS.fireworks.requestsPerMonth).toBe(1000);
		});
	});

	describe("Request Counting", () => {
		it("should increment request count", () => {
			// Just verify it doesn't throw
			expect(() => {
				incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });
			}).not.toThrow();
		});

		it("should track model usage", () => {
			incrementModelRequestCount({ provider: "test", modelId: "model-1", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "test", modelId: "model-1", tokensIn: 200, tokensOut: 100 });

			const usage = getModelUsage("test", "model-1");
			expect(usage).toBeDefined();
			expect(usage?.count).toBe(2);
			expect(usage?.tokensIn).toBe(300);
			expect(usage?.tokensOut).toBe(150);
		});

		it("should return undefined for unknown models", () => {
			const usage = getModelUsage("unknown", "unknown-model");
			expect(usage).toBeUndefined();
		});

		it("should track different models separately", () => {
			incrementModelRequestCount({ provider: "test", modelId: "model-a", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "test", modelId: "model-b", tokensIn: 200, tokensOut: 100 });

			expect(getModelUsage("test", "model-a")?.count).toBe(1);
			expect(getModelUsage("test", "model-b")?.count).toBe(1);
		});
	});

	describe("Provider Model Usage", () => {
		it("should return all models for a provider", () => {
			incrementModelRequestCount({ provider: "test-provider", modelId: "model-1", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "test-provider", modelId: "model-2", tokensIn: 200, tokensOut: 100 });

			const models = getProviderModelUsage("test-provider");
			expect(models).toHaveLength(2);
			expect(models.map((m) => m.modelId)).toContain("model-1");
			expect(models.map((m) => m.modelId)).toContain("model-2");
		});

		it("should return empty array for unknown provider", () => {
			const models = getProviderModelUsage("nonexistent");
			expect(models).toEqual([]);
		});
	});

	describe("Top Models", () => {
		it("should return top N models by request count", () => {
			// Add many models with varying request counts
			for (let i = 0; i < 5; i++) {
				incrementModelRequestCount({ provider: "test", modelId: "popular-model", tokensIn: 100, tokensOut: 50 });
			}
			incrementModelRequestCount({ provider: "test", modelId: "unpopular-model", tokensIn: 100, tokensOut: 50 });

			const top = getTopModels(2);
			expect(top).toHaveLength(2);
			expect(top[0].modelId).toBe("popular-model");
		});
	});

	describe("Free Tier Usage", () => {
		it("should calculate usage for kilo provider", () => {
			// Simulate requests (out of 200/hour limit)
			for (let i = 0; i < 100; i++) {
				incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 10, tokensOut: 10 });
			}

			const usage = getFreeTierUsage("kilo");
			// requestsThisHour is capped at 50 as a rough estimate
			expect(usage.requestsToday).toBeGreaterThanOrEqual(100);
			expect(usage.requestsThisHour).toBeLessThanOrEqual(50);
		});

		it("should calculate usage for providers without hourly limits", () => {
			// OpenRouter has daily limit, not hourly
			const usage = getFreeTierUsage("openrouter");
			expect(usage.requestsThisHour).toBe(0);
		});
	});

	describe("Limit Warnings", () => {
		it("should detect when approaching limit", () => {
			// Use openrouter with daily limit (1000/day)
			// Add 750 requests = 75% which triggers warning
			for (let i = 0; i < 750; i++) {
				incrementModelRequestCount({ provider: "openrouter", modelId: "gpt-4", tokensIn: 10, tokensOut: 10 });
			}

			expect(isApproachingLimit("openrouter")).toBe(true);
		});

		it("should not trigger warning when usage is low", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 10, tokensOut: 10 });
			expect(isApproachingLimit("kilo")).toBe(false);
		});

		it("should return warning message when approaching limit", () => {
			// Use openrouter with daily limit (1000/day)
			// Add 750 requests = 75% which triggers warning
			for (let i = 0; i < 750; i++) {
				incrementModelRequestCount({ provider: "openrouter", modelId: "gpt-4", tokensIn: 10, tokensOut: 10 });
			}

			const warning = getLimitWarning("openrouter");
			expect(warning).not.toBeNull();
			expect(warning).toContain("%");
		});

		it("should return null when not approaching limit", () => {
			const warning = getLimitWarning("kilo");
			expect(warning).toBeNull();
		});
	});

	describe("Session Usage", () => {
		it("should generate session report", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 1000, tokensOut: 500 });
			incrementModelRequestCount({ provider: "openrouter", modelId: "mimo", tokensIn: 500, tokensOut: 250 });

			const report = getSessionUsage();
			expect(report.totalRequests).toBe(2);
			expect(report.totalTokensIn).toBe(1500);
			expect(report.totalTokensOut).toBe(750);
		});

		it("should track providers in session report", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "openrouter", modelId: "mimo", tokensIn: 100, tokensOut: 50 });

			const report = getSessionUsage();
			const providerNames = report.providers.map((p) => p.name);
			expect(providerNames).toContain("kilo");
			expect(providerNames).toContain("openrouter");
		});
	});

	describe("Status Formatting", () => {
		it("should format status for provider", () => {
			const status = formatFreeTierStatus("kilo");
			expect(typeof status).toBe("string");
			expect(status).toContain("kilo");
		});
	});
});
