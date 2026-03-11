import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Explicitly load .env file (Bun won't override existing env vars)
function loadEnvFile() {
	try {
		const envPath = resolve(import.meta.dir, "../../.env");
		const content = readFileSync(envPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			const key = trimmed.slice(0, eqIdx).trim();
			const value = trimmed.slice(eqIdx + 1).trim();
			// Always override — .env file is the source of truth for this app
			process.env[key] = value;
		}
	} catch {
		// .env file doesn't exist, rely on existing env vars
	}
}

loadEnvFile();

function env(key: string): string | undefined {
	return process.env[key] || undefined;
}

function required(key: string): string {
	const v = process.env[key];
	if (!v) throw new Error(`Missing required config: ${key}`);
	return v;
}

export const settings = {
	server: {
		port: Number(env("PORT")) || 8000,
		corsOrigin: env("CORS_ORIGIN") || "http://localhost:5173",
		isProduction: env("NODE_ENV") === "production",
	},
	anthropic: {
		get apiKey(): string {
			return required("ANTHROPIC_API_KEY");
		},
	},
	scraper: {
		concurrency: Number(env("SCRAPER_CONCURRENCY")) || 4,
		pageTimeout: Number(env("SCRAPER_PAGE_TIMEOUT")) || 60000,
		delayBetweenRequests: Number(env("SCRAPER_DELAY")) || 1500,
	},
};
