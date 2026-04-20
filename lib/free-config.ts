/**
 * Free model filter configuration persistence.
 *
 * Stores settings in ~/.pi/free.json:
 * - free_only: boolean (default true)
 * - provider_overrides: Record<string, boolean>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "./logger.ts";

const _logger = createLogger("free-config");

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";
const PI_DIR = join(HOME_DIR, ".pi");
const CONFIG_PATH = join(PI_DIR, "free.json");

/**
 * Configuration shape for free model filtering
 */
export interface FreeConfig {
	/** Global free-only mode */
	free_only?: boolean;
	/** Per-provider free-only overrides */
	provider_overrides?: Record<string, boolean>;
}

const DEFAULT_CONFIG: FreeConfig = {
	free_only: true,
	provider_overrides: {},
};

/**
 * Ensure the config file exists with proper defaults
 */
function ensureConfigFile(): void {
	try {
		const dir = dirname(CONFIG_PATH);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		if (existsSync(CONFIG_PATH)) {
			// Merge any new template keys without touching existing values
			const existing = JSON.parse(
				readFileSync(CONFIG_PATH, "utf8"),
			) as FreeConfig;
			const merged = { ...DEFAULT_CONFIG, ...existing };

			// Only write if there are new keys to add
			if (JSON.stringify(merged) !== JSON.stringify(existing)) {
				writeFileSync(
					CONFIG_PATH,
					`${JSON.stringify(merged, null, 2)}\n`,
					"utf8",
				);
				_logger.info("Updated config file with new keys");
			}
		} else {
			// Create new config file with defaults
			writeFileSync(
				CONFIG_PATH,
				`${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
				"utf8",
			);
			_logger.info("Created new config file");
		}
	} catch (err) {
		_logger.error("Failed to ensure config file", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

/**
 * Load the current configuration
 */
export function loadFreeConfig(): FreeConfig {
	ensureConfigFile();
	try {
		const content = readFileSync(CONFIG_PATH, "utf8");
		return { ...DEFAULT_CONFIG, ...JSON.parse(content) } as FreeConfig;
	} catch (err) {
		_logger.error("Failed to load config, using defaults", {
			error: err instanceof Error ? err.message : String(err),
		});
		return { ...DEFAULT_CONFIG };
	}
}

/**
 * Save configuration updates
 */
export function saveFreeConfig(updates: Partial<FreeConfig>): void {
	try {
		const current = loadFreeConfig();
		const merged = { ...current, ...updates };
		writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
		_logger.info("Saved config updates", { keys: Object.keys(updates) });
	} catch (err) {
		_logger.error("Failed to save config", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
}
