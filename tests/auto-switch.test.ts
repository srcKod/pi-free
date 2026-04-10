import { describe, expect, it, vi } from "vitest";
import { autoFailover } from "../provider-failover/auto-switch.ts";

describe("Auto-switch failover", () => {
	it("is enabled by default and switches to fallback model", async () => {
		const setModel = vi.fn().mockResolvedValue(true);

		const failedModel = {
			provider: "kilo",
			id: "mimo-v2-pro-free",
			name: "MiMo V2 Pro Free",
			baseUrl: "https://api.kilo.ai/api/gateway",
			cost: { input: 0, output: 0 },
		} as any;

		const fallbackModel = {
			provider: "openrouter",
			id: "mimo-v2-pro-free",
			name: "MiMo V2 Pro Free",
			baseUrl: "https://openrouter.ai/api/v1",
			cost: { input: 0, output: 0 },
		} as any;

		const result = await autoFailover(
			"429 Rate limit",
			failedModel,
			{ setModel } as any,
			{
				modelRegistry: {
					getAvailable: () => [fallbackModel],
				},
			} as any,
			{},
		);

		expect(setModel).toHaveBeenCalledWith(fallbackModel);
		expect(result.switched).toBe(true);
		expect(result.success).toBe(true);
	});

	it("does not switch when explicitly disabled", async () => {
		const setModel = vi.fn().mockResolvedValue(true);

		const result = await autoFailover(
			"429 Rate limit",
			{ provider: "kilo", id: "mimo-v2-pro-free", name: "MiMo" } as any,
			{ setModel } as any,
			{
				modelRegistry: {
					getAvailable: () => [],
				},
			} as any,
			{ enabled: false },
		);

		expect(setModel).not.toHaveBeenCalled();
		expect(result.switched).toBe(false);
		expect(result.message).toContain("disabled");
	});
});
