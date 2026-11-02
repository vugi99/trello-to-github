import { describe, expect, it } from "bun:test";
import {
	buildTrelloToGitHubMapFromIssues,
	extractTrelloCardKey,
	fixReferencesInText,
} from "../lib/references";

describe("Trello references fixer", () => {
	describe("extractTrelloCardKey", () => {
		it("extracts shortLink from card URL with slug", () => {
			expect(
				extractTrelloCardKey(
					"https://trello.com/c/tFQeldGq/566-network-disconnect-game-caching",
				),
			).toBe("tFQeldGq");
		});

		it("extracts shortLink from minimal card URL", () => {
			expect(extractTrelloCardKey("https://trello.com/c/tFQeldGq")).toBe(
				"tFQeldGq",
			);
			expect(extractTrelloCardKey("http://www.trello.com/c/SFkwT4Yg/")).toBe(
				"SFkwT4Yg",
			);
		});

		it("extracts card ID from /1/cards/ URL", () => {
			expect(
				extractTrelloCardKey(
					"https://trello.com/1/cards/6ae5240de25db5c7f35f4eb7",
				),
			).toBe("6ae5240de25db5c7f35f4eb7");
		});

		it("returns null for attachment and preview URLs", () => {
			expect(
				extractTrelloCardKey(
					"https://trello.com/1/cards/64c6596edd83335d17bfff65/attachments/64c6598abb9a64b064533613/download/image.png",
				),
			).toBeNull();
		});

		it("returns null for board URLs", () => {
			expect(
				extractTrelloCardKey("https://trello.com/b/6160a931/vzombies"),
			).toBeNull();
		});

		it("accepts direct 8-char shortLink or 24-char card ID", () => {
			expect(extractTrelloCardKey("tFQeldGq")).toBe("tFQeldGq");
			expect(extractTrelloCardKey("6ae5240de25db5c7f35f4eb7")).toBe(
				"6ae5240de25db5c7f35f4eb7",
			);
		});
	});

	describe("fixReferencesInText", () => {
		const mapping = new Map([
			["tFQeldGq", 52],
			["SFkwT4Yg", 53],
		]);
		const repo = { owner: "vugi99", repo: "nanos-vzombies" };

		it("replaces Trello smartCard markdown link with #ticket-id", () => {
			const input =
				'related: [https://trello.com/c/tFQeldGq/566-network-disconnect](https://trello.com/c/tFQeldGq/566-network-disconnect "smartCard-inline")';
			const res = fixReferencesInText(input, mapping, { format: "id", repo });
			expect(res.hasChanged).toBe(true);
			expect(res.replacedCount).toBe(1);
			expect(res.text).toBe("related: #52");
		});

		it("replaces Trello smartCard with full ticket link when format is url", () => {
			const input =
				"[https://trello.com/c/tFQeldGq/566-network-disconnect](https://trello.com/c/tFQeldGq/566-network-disconnect)";
			const res = fixReferencesInText(input, mapping, { format: "url", repo });
			expect(res.text).toBe(
				"https://github.com/vugi99/nanos-vzombies/issues/52",
			);
		});

		it("replaces Trello smartCard with [#id](url) when format is markdown", () => {
			const input =
				"[https://trello.com/c/tFQeldGq/566-network-disconnect](https://trello.com/c/tFQeldGq/566-network-disconnect)";
			const res = fixReferencesInText(input, mapping, {
				format: "markdown",
				repo,
			});
			expect(res.text).toBe(
				"[#52](https://github.com/vugi99/nanos-vzombies/issues/52)",
			);
		});

		it("preserves custom anchor text and updates destination URL", () => {
			const input =
				"See [Network disconnect issue](https://trello.com/c/tFQeldGq/566-network) for info.";
			const res = fixReferencesInText(input, mapping, { format: "id", repo });
			expect(res.text).toBe(
				"See [Network disconnect issue](https://github.com/vugi99/nanos-vzombies/issues/52) for info.",
			);
		});

		it("replaces bare URLs preserving trailing punctuation", () => {
			const input =
				"Check https://trello.com/c/tFQeldGq/566-network, and also https://trello.com/c/SFkwT4Yg.";
			const res = fixReferencesInText(input, mapping, { format: "id", repo });
			expect(res.text).toBe("Check #52, and also #53.");
		});

		it("replaces angle-bracket URLs", () => {
			const input = "Related: <https://trello.com/c/tFQeldGq>";
			const res = fixReferencesInText(input, mapping, { format: "id", repo });
			expect(res.text).toBe("Related: #52");
		});

		it("strictly preserves > Migrated from [Trello Card](...) footer", () => {
			const input = `Save games and resume where they were, related: [https://trello.com/c/tFQeldGq/566-network-disconnect-game-caching-need-to-know-the-players-disconnect-reason](https://trello.com/c/tFQeldGq/566-network-disconnect-game-caching-need-to-know-the-players-disconnect-reason "smartCard-inline")

---

> Migrated from [Trello Card](https://trello.com/c/SFkwT4Yg/603-saving-loading-games)
`;

			const res = fixReferencesInText(input, mapping, { format: "id", repo });
			expect(res.hasChanged).toBe(true);
			expect(res.replacedCount).toBe(1);
			expect(res.text).toBe(`Save games and resume where they were, related: #52

---

> Migrated from [Trello Card](https://trello.com/c/SFkwT4Yg/603-saving-loading-games)
`);
		});

		it("leaves text unchanged if referenced card is unmapped", () => {
			const input =
				"Check https://trello.com/c/UNKNOWN8/unmigrated-card for details.";
			const res = fixReferencesInText(input, mapping, { format: "id", repo });
			expect(res.hasChanged).toBe(false);
			expect(res.replacedCount).toBe(0);
			expect(res.text).toBe(input);
		});
	});

	describe("buildTrelloToGitHubMapFromIssues", () => {
		it("extracts mappings from issue migration footers", () => {
			const issues = [
				{
					number: 52,
					title: "Network disconnect game caching",
					body: "Desc\n\n> Migrated from [Trello Card](https://trello.com/c/tFQeldGq/566-network-disconnect)",
				},
				{
					number: 53,
					title: "SAVING/LOADING games",
					body: "Desc\n\n> Migrated from [Trello Card](https://trello.com/c/SFkwT4Yg/603-saving-loading-games)",
				},
			];

			const map = buildTrelloToGitHubMapFromIssues(issues);
			expect(map.get("tFQeldGq")).toBe(52);
			expect(map.get("SFkwT4Yg")).toBe(53);
			expect(
				map.get("https://trello.com/c/tFQeldGq/566-network-disconnect"),
			).toBe(52);
		});

		it("incorporates full Trello card objects with IDs", () => {
			const issues = [
				{
					number: 52,
					title: "Network disconnect game caching",
					body: "Desc\n\n> Migrated from [Trello Card](https://trello.com/c/tFQeldGq/566-network-disconnect)",
				},
			];
			const trelloCards = [
				{
					id: "6ae5240de25db5c7f35f4eb7",
					shortLink: "tFQeldGq",
					shortUrl: "https://trello.com/c/tFQeldGq",
					url: "https://trello.com/c/tFQeldGq/566-network-disconnect",
					name: "Network disconnect game caching",
				},
			];

			const map = buildTrelloToGitHubMapFromIssues(issues, trelloCards);
			expect(map.get("6ae5240de25db5c7f35f4eb7")).toBe(52);
			expect(map.get("tFQeldGq")).toBe(52);
			expect(map.get("https://trello.com/c/tFQeldGq")).toBe(52);
		});
	});
});
