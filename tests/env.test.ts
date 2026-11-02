import { afterEach, describe, expect, it } from "bun:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getGitHubToken, getTrelloAuth, loadEnvFile } from "../lib/env";

describe("env token resolver", () => {
	const tempEnvPath = resolve(process.cwd(), ".env.test-tmp");

	afterEach(() => {
		try {
			unlinkSync(tempEnvPath);
		} catch {
			// ignore
		}
	});

	describe("loadEnvFile", () => {
		it("parses key-value pairs, trims quotes, and ignores comments", () => {
			writeFileSync(
				tempEnvPath,
				`
# Comment line
GITHUB_TOKEN=ghp_sample123
GH_TOKEN="ghp_quoted456"
TRELLO_KEY='trellokey789'
INVALID_LINE_WITHOUT_EQUALS
`,
			);

			const testEnv: Record<string, string | undefined> = {};
			const parsed = loadEnvFile(".env.test-tmp", testEnv);

			expect(parsed.GITHUB_TOKEN).toBe("ghp_sample123");
			expect(parsed.GH_TOKEN).toBe("ghp_quoted456");
			expect(parsed.TRELLO_KEY).toBe("trellokey789");
			expect(parsed.INVALID_LINE_WITHOUT_EQUALS).toBeUndefined();
			expect(testEnv.GITHUB_TOKEN).toBe("ghp_sample123");
		});

		it("returns empty object if file does not exist", () => {
			const parsed = loadEnvFile(".non-existent-env-file");
			expect(parsed).toEqual({});
		});
	});

	describe("getGitHubToken", () => {
		it("prefers CLI token over environment variables", () => {
			const env = { GITHUB_TOKEN: "env_token" };
			expect(getGitHubToken("cli_token", env)).toBe("cli_token");
		});

		it("falls back to GITHUB_TOKEN if CLI token is not supplied", () => {
			const env = { GITHUB_TOKEN: "env_github_token" };
			expect(getGitHubToken(undefined, env)).toBe("env_github_token");
		});

		it("falls back to GH_TOKEN if GITHUB_TOKEN is not set", () => {
			const env = { GH_TOKEN: "env_gh_token" };
			expect(getGitHubToken(undefined, env)).toBe("env_gh_token");
		});

		it("falls back to PAT if GITHUB_TOKEN and GH_TOKEN are not set", () => {
			const env = { PAT: "env_pat" };
			expect(getGitHubToken(undefined, env)).toBe("env_pat");
		});

		it("returns undefined if no token is found", () => {
			const env = {};
			expect(getGitHubToken(undefined, env)).toBeUndefined();
		});
	});

	describe("getTrelloAuth", () => {
		it("prefers CLI options over environment variables", () => {
			const env = { TRELLO_KEY: "env_key", TRELLO_TOKEN: "env_token" };
			const auth = getTrelloAuth({ key: "cli_key", token: "cli_token" }, env);
			expect(auth.key).toBe("cli_key");
			expect(auth.token).toBe("cli_token");
		});

		it("reads TRELLO_KEY and TRELLO_TOKEN from env", () => {
			const env = { TRELLO_KEY: "env_key", TRELLO_TOKEN: "env_token" };
			const auth = getTrelloAuth(undefined, env);
			expect(auth.key).toBe("env_key");
			expect(auth.token).toBe("env_token");
		});

		it("reads TRELLO_API_KEY and TRELLO_API_TOKEN as fallbacks", () => {
			const env = { TRELLO_API_KEY: "api_key", TRELLO_API_TOKEN: "api_token" };
			const auth = getTrelloAuth(undefined, env);
			expect(auth.key).toBe("api_key");
			expect(auth.token).toBe("api_token");
		});
	});
});
