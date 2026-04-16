/**
 * Shared JSON persistence utilities.
 * Consolidates file I/O patterns from usage-store.ts and free-tier-limits.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "./logger.ts";

const _logger = createLogger("json-persistence");

export interface JSONStore<T> {
	load(): T;
	save(data: T): void;
}

/**
 * Create a JSON file store with automatic directory creation and error handling.
 */
export function createJSONStore<T extends object>(
	filepath: string,
	defaultValue: T,
): JSONStore<T> {
	let cached: T | null = null;

	function load(): T {
		if (cached) return cached;
		try {
			if (existsSync(filepath)) {
				cached = JSON.parse(readFileSync(filepath, "utf-8")) as T;
				return cached;
			}
		} catch (err) {
			_logger.warn("Failed to load JSON store, using default", { filepath, error: err });
		}
		cached = defaultValue;
		return cached;
	}

	function save(data: T): void {
		cached = data;
		try {
			const dir = dirname(filepath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			writeFileSync(filepath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
		} catch (err) {
			_logger.warn("Failed to save JSON store", { filepath, error: err });
		}
	}

	return { load, save };
}

/**
 * Create a JSONL (newline-delimited JSON) store for append-only logs.
 */
export function createJSONLStore<T extends object>(
	filepath: string,
): {
	load(): T[];
	append(entry: T): void;
	clear(): void;
} {
	function load(): T[] {
		try {
			if (existsSync(filepath)) {
				const content = readFileSync(filepath, "utf-8");
				return content
					.split("\n")
					.filter((line) => line.trim())
					.map((line) => JSON.parse(line) as T);
			}
		} catch (err) {
			_logger.warn("Failed to load JSONL store, using empty array", { filepath, error: err });
		}
		return [];
	}

	function append(entry: T): void {
		try {
			const dir = dirname(filepath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			const line = JSON.stringify(entry);
			writeFileSync(filepath, `${line}\n`, { flag: "a", encoding: "utf-8" });
		} catch (err) {
			_logger.warn("Failed to append to JSONL store", { filepath, error: err });
		}
	}

	function clear(): void {
		try {
			writeFileSync(filepath, "", "utf-8");
		} catch (err) {
			_logger.warn("Failed to clear JSONL store", { filepath, error: err });
		}
	}

	return { load, append, clear };
}
