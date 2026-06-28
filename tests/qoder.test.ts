/**
 * Qoder Provider Tests
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetQoderShowPaid = vi.fn();
const mockGetCachedModels = vi.fn();
const mockIsCacheStale = vi.fn();
const mockUpdateQoderModelsCache = vi.fn();
const mockGetCachedCredentials = vi.fn();
const mockLoginQoder = vi.fn();
const mockRefreshQoderToken = vi.fn();
const mockRegisterWithGlobalToggle = vi.fn();
let capturedToggleArgs: unknown[] = [];

vi.mock("../constants.ts", () => ({
	BASE_URL_QODER: "https://api2-v2.qoder.sh",
	PROVIDER_QODER: "qoder",
}));

vi.mock("../config.ts", () => ({
	getProviderShowPaid: () => mockGetQoderShowPaid(),
	saveConfig: vi.fn(),
}));

vi.mock("../lib/registry.ts", () => ({
	registerWithGlobalToggle: (...args: unknown[]) => {
		capturedToggleArgs.push(args);
		mockRegisterWithGlobalToggle(...args);
	},
}));

vi.mock("../provider-helper.ts", () => ({
	enhanceWithCI: (models: unknown[]) => models,
}));

vi.mock("../providers/qoder/auth.ts", () => ({
	getCachedCredentials: () => mockGetCachedCredentials(),
	loginQoder: (...args: unknown[]) => mockLoginQoder(...args),
	refreshQoderToken: (...args: unknown[]) => mockRefreshQoderToken(...args),
}));

vi.mock("../providers/qoder/models.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../providers/qoder/models.ts")>();
	return {
		...actual,
		getCachedModels: () => mockGetCachedModels(),
		isCacheStale: () => mockIsCacheStale(),
		updateQoderModelsCache: (...args: unknown[]) =>
			mockUpdateQoderModelsCache(...args),
		getCachedModelConfig: vi.fn(),
		isBasicModel: (m: { id: string }) =>
			["auto", "ultimate", "performance", "efficient", "lite"].includes(m.id),
	};
});

import qoderProvider from "../providers/qoder/qoder.ts";
import { isBasicModel, staticModels } from "../providers/qoder/models.ts";

describe("Qoder model classification", () => {
	it("classifies basic router models correctly", () => {
		for (const id of ["auto", "ultimate", "performance", "efficient", "lite"]) {
			const model = staticModels.find((m) => m.id === id);
			expect(model).toBeDefined();
			expect(isBasicModel(model!)).toBe(true);
		}
	});

	it("classifies premium named models as non-basic", () => {
		for (const id of ["qmodel", "dmodel", "kmodel", "mmodel"]) {
			const model = staticModels.find((m) => m.id === id);
			expect(model).toBeDefined();
			expect(isBasicModel(model!)).toBe(false);
		}
	});

	it("classifies unknown models as non-basic", () => {
		expect(
			isBasicModel({
				id: "unknown-model",
				name: "Unknown",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000,
				maxTokens: 100,
			}),
		).toBe(false);
	});
});

describe("Qoder Provider", () => {
	let mockPi: ExtensionAPI;
	let mockRegisterProvider: ReturnType<typeof vi.fn>;
	let mockRegisterCommand: ReturnType<typeof vi.fn>;
	let commandHandlers: Record<string, Function>;

	const basicModels = [
		{
			id: "auto",
			name: "Qoder Auto",
			reasoning: true,
			input: ["text", "image"] as const,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 180_000,
			maxTokens: 32_768,
		},
		{
			id: "lite",
			name: "Qoder Lite",
			reasoning: false,
			input: ["text"] as const,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 180_000,
			maxTokens: 32_768,
		},
];

	const premiumModels = [
		{
			id: "qmodel",
			name: "Qwen3.7 Plus (Qoder)",
			reasoning: false,
			input: ["text", "image"] as const,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1_000_000,
			maxTokens: 32_768,
		},
		{
			id: "dmodel",
			name: "DeepSeek V4 Pro (Qoder)",
			reasoning: true,
			input: ["text", "image"] as const,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1_000_000,
			maxTokens: 32_768,
		},
];

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetQoderShowPaid.mockReset().mockReturnValue(false);
		mockGetCachedModels.mockReset().mockReturnValue([...basicModels, ...premiumModels]);
		mockIsCacheStale.mockReset().mockReturnValue(false);
		mockUpdateQoderModelsCache.mockReset().mockResolvedValue(undefined);
		mockGetCachedCredentials.mockReset().mockReturnValue(null);
		mockLoginQoder.mockReset().mockResolvedValue({
			access: "oauth-token",
			refresh: "refresh-token",
			expires: Date.now() + 3600_000,
		});
		mockRefreshQoderToken.mockReset();
		mockRegisterWithGlobalToggle.mockReset();
		capturedToggleArgs = [];

		mockRegisterProvider = vi.fn();
		mockRegisterCommand = vi.fn((name: string, config: { handler: Function }) => {
			commandHandlers[name] = config.handler;
		});
		commandHandlers = {};

		mockPi = {
			registerProvider: mockRegisterProvider,
			on: vi.fn(),
			registerCommand: mockRegisterCommand,
		} as unknown as ExtensionAPI;
	});

	describe("initialization", () => {
		it("should register provider with basic (free-tier) models by default", async () => {
			await qoderProvider(mockPi);

			expect(mockRegisterProvider).toHaveBeenCalledWith(
				"qoder",
				expect.objectContaining({
					baseUrl: "https://api2-v2.qoder.sh",
					models: expect.arrayContaining([
						expect.objectContaining({ id: "auto" }),
						expect.objectContaining({ id: "lite" }),
					]),
					streamSimple: expect.any(Function),
				}),
			);

			const registeredModels = mockRegisterProvider.mock.calls[0][1].models;
			expect(registeredModels).toHaveLength(2);
			expect(registeredModels.some((m: { id: string }) => m.id === "qmodel")).toBe(false);
			expect(registeredModels.some((m: { id: string }) => m.id === "dmodel")).toBe(false);
		});

		it("should register all models when QODER_SHOW_PAID is true", async () => {
			mockGetQoderShowPaid.mockReturnValue(true);

			await qoderProvider(mockPi);

			const registeredModels = mockRegisterProvider.mock.calls[0][1].models;
			expect(registeredModels).toHaveLength(4);
			expect(registeredModels.some((m: { id: string }) => m.id === "qmodel")).toBe(true);
			expect(registeredModels.some((m: { id: string }) => m.id === "dmodel")).toBe(true);
		});

		it("should register with global toggle system", async () => {
			await qoderProvider(mockPi);

			expect(mockRegisterWithGlobalToggle).toHaveBeenCalledWith(
				"qoder",
				expect.objectContaining({
					free: expect.arrayContaining([
						expect.objectContaining({ id: "auto" }),
						expect.objectContaining({ id: "lite" }),
					]),
					all: expect.arrayContaining([
						expect.objectContaining({ id: "auto" }),
						expect.objectContaining({ id: "qmodel" }),
					]),
				}),
				expect.any(Function),
				false,
			);
		});
	});

	describe("toggle-qoder command", () => {
		it("should toggle from basic to all models", async () => {
			await qoderProvider(mockPi);
			mockRegisterProvider.mockClear();

			const notify = vi.fn();
			await commandHandlers["toggle-qoder"]({}, { ui: { notify } });

			expect(notify).toHaveBeenCalledWith(
				"qoder: showing all 4 models (2 basic, 2 premium)",
				"info",
			);
			expect(mockRegisterProvider).toHaveBeenCalledWith(
				"qoder",
				expect.objectContaining({
					models: expect.arrayContaining([
						expect.objectContaining({ id: "qmodel" }),
					]),
				}),
			);
		});

		it("should toggle back to basic models", async () => {
			await qoderProvider(mockPi);

			const notify = vi.fn();
			await commandHandlers["toggle-qoder"]({}, { ui: { notify } });
			mockRegisterProvider.mockClear();
			await commandHandlers["toggle-qoder"]({}, { ui: { notify } });

			expect(notify).toHaveBeenLastCalledWith(
				"qoder: showing 2 basic (free-tier) models",
				"info",
			);
			const registeredModels = mockRegisterProvider.mock.calls[0][1].models;
			expect(registeredModels).toHaveLength(2);
			expect(registeredModels.every((m: { id: string }) => ["auto", "lite"].includes(m.id))).toBe(true);
		});

		it("should persist paid mode to config", async () => {
			const { saveConfig } = await import("../config.ts");

			await qoderProvider(mockPi);

			const notify = vi.fn();
			await commandHandlers["toggle-qoder"]({}, { ui: { notify } });

			expect(saveConfig).toHaveBeenCalledWith({ qoder_show_paid: true });
		});
	});

	describe("OAuth integration", () => {
		it("should have OAuth configuration", async () => {
			await qoderProvider(mockPi);

			const registerCall = mockRegisterProvider.mock.calls[0];
			expect(registerCall[1]).toHaveProperty("oauth");
			expect(registerCall[1].oauth).toHaveProperty("name");
			expect(registerCall[1].oauth).toHaveProperty("login");
			expect(registerCall[1].oauth).toHaveProperty("refreshToken");
			expect(registerCall[1].oauth).toHaveProperty("getApiKey");
		});

		it("should call loginQoder on OAuth login", async () => {
			await qoderProvider(mockPi);

			const oauth = mockRegisterProvider.mock.calls[0][1].oauth;
			await oauth.login({ onProgress: vi.fn() });

			expect(mockLoginQoder).toHaveBeenCalled();
		});
	});
});
