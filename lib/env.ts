import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Parses simple .env content and sets variables into target env object if not already defined.
 */
export function loadEnvFile(
	envPath = ".env",
	targetEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
	const resolved = resolve(process.cwd(), envPath);
	if (!existsSync(resolved)) {
		return {};
	}

	const parsed: Record<string, string> = {};
	try {
		const content = readFileSync(resolved, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;

			const key = trimmed.slice(0, eqIdx).trim();
			let val = trimmed.slice(eqIdx + 1).trim();

			// Remove quotes if present
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}

			parsed[key] = val;
			if (!targetEnv[key]) {
				targetEnv[key] = val;
			}
		}
	} catch {
		// Ignore read errors
	}

	return parsed;
}

export function getEnvVar(
	names: string[],
	env: Record<string, string | undefined> = process.env,
): string | undefined {
	for (const name of names) {
		const val = env[name];
		if (typeof val === "string" && val.trim().length > 0) {
			return val.trim();
		}
	}
	return undefined;
}

export function getGitHubToken(
	cliToken?: string,
	env: Record<string, string | undefined> = process.env,
): string | undefined {
	if (cliToken && cliToken.trim().length > 0) {
		return cliToken.trim();
	}
	return getEnvVar(["GITHUB_TOKEN", "GH_TOKEN", "PAT"], env);
}

export function getTrelloAuth(
	cliAuth?: { key?: string; token?: string },
	env: Record<string, string | undefined> = process.env,
): {
	key?: string;
	token?: string;
} {
	const key =
		(cliAuth?.key && cliAuth.key.trim().length > 0
			? cliAuth.key.trim()
			: undefined) ?? getEnvVar(["TRELLO_KEY", "TRELLO_API_KEY"], env);

	const token =
		(cliAuth?.token && cliAuth.token.trim().length > 0
			? cliAuth.token.trim()
			: undefined) ?? getEnvVar(["TRELLO_TOKEN", "TRELLO_API_TOKEN"], env);

	return { key, token };
}
