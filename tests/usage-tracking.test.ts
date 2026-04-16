/**
 * Usage Tracking Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	getModelUsage,
	getProviderModelUsage,
	getSessionUsage,
	getTopModels,
	incrementModelRequestCount,
	resetUsageStats,
} from "../usage/tracking.ts";

describe("Usage Tracking", () => {
	beforeEach(() => {
		resetUsageStats();
	});

	describe("incrementModelRequestCount", () => {
		it("should track model requests", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });

			const usage = getModelUsage("kilo", "gpt-4");
			expect(usage).toBeDefined();
			expect(usage?.count).toBe(1);
			expect(usage?.tokensIn).toBe(100);
			expect(usage?.tokensOut).toBe(50);
		});

		it("should accumulate multiple requests", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 200, tokensOut: 100 });

			const usage = getModelUsage("kilo", "gpt-4");
			expect(usage?.count).toBe(2);
			expect(usage?.tokensIn).toBe(300);
			expect(usage?.tokensOut).toBe(150);
		});

		it("should track different models separately", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "claude-3", tokensIn: 200, tokensOut: 100 });

			expect(getModelUsage("kilo", "gpt-4")?.count).toBe(1);
			expect(getModelUsage("kilo", "claude-3")?.count).toBe(1);
		});

		it("should track different providers separately", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "openrouter", modelId: "gpt-4", tokensIn: 200, tokensOut: 100 });

			expect(getModelUsage("kilo", "gpt-4")?.count).toBe(1);
			expect(getModelUsage("openrouter", "gpt-4")?.count).toBe(1);
		});
	});

	describe("getProviderModelUsage", () => {
		it("should return all models for provider", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "model-a", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "model-b", tokensIn: 200, tokensOut: 100 });
			incrementModelRequestCount({ provider: "openrouter", modelId: "model-c", tokensIn: 300, tokensOut: 150 });

			const kiloModels = getProviderModelUsage("kilo");
			expect(kiloModels).toHaveLength(2);
			expect(kiloModels.map((m) => m.modelId)).toContain("model-a");
			expect(kiloModels.map((m) => m.modelId)).toContain("model-b");
		});

		it("should sort by count descending", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "popular", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "popular", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "popular", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "unpopular", tokensIn: 100, tokensOut: 50 });

			const models = getProviderModelUsage("kilo");
			expect(models[0].modelId).toBe("popular");
			expect(models[0].count).toBe(3);
		});
	});

	describe("getTopModels", () => {
		it("should return top N models across providers", () => {
			// Add many models
			for (let i = 0; i < 5; i++) {
				incrementModelRequestCount({ provider: "kilo", modelId: `kilo-model-${i}`, tokensIn: 100, tokensOut: 50 });
			}
			for (let i = 0; i < 5; i++) {
				incrementModelRequestCount({ provider: "openrouter", modelId: `or-model-${i}`, tokensIn: 100, tokensOut: 50 });
			}

			const top5 = getTopModels(5);
			expect(top5).toHaveLength(5);
		});

		it("should sort by total count", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "high-usage", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "high-usage", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "high-usage", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "low-usage", tokensIn: 100, tokensOut: 50 });

			const top = getTopModels(2);
			expect(top[0].modelId).toBe("high-usage");
			expect(top[0].count).toBe(3);
		});
	});

	describe("getSessionUsage", () => {
		it("should return session stats", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 1000, tokensOut: 500 });
			incrementModelRequestCount({ provider: "openrouter", modelId: "claude", tokensIn: 2000, tokensOut: 1000 });

			const session = getSessionUsage();
			expect(session.totalRequests).toBe(2);
			expect(session.totalTokensIn).toBe(3000);
			expect(session.totalTokensOut).toBe(1500);
			expect(session.providers).toHaveLength(2);
		});

		it("should format duration", () => {
			const session = getSessionUsage();
			expect(session.duration).toBeGreaterThanOrEqual(0);
			expect(typeof session.durationFormatted).toBe("string");
		});

		it("should sort providers by request count", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "model", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "model", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "kilo", modelId: "model", tokensIn: 100, tokensOut: 50 });
			incrementModelRequestCount({ provider: "openrouter", modelId: "model", tokensIn: 100, tokensOut: 50 });

			const session = getSessionUsage();
			expect(session.providers[0].name).toBe("kilo");
			expect(session.providers[0].requests).toBe(3);
		});
	});

	describe("resetUsageStats", () => {
		it("should clear all stats", () => {
			incrementModelRequestCount({ provider: "kilo", modelId: "gpt-4", tokensIn: 100, tokensOut: 50 });
			resetUsageStats();

			const usage = getModelUsage("kilo", "gpt-4");
			expect(usage).toBeUndefined();

			const session = getSessionUsage();
			expect(session.totalRequests).toBe(0);
		});
	});
});
