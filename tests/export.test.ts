import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TOML from "smol-toml";
import { describe, expect, it } from "vitest";
import { BoardExport, MapFormat } from "../lib/schemas";

describe("real world example fixtures", () => {
	it("parses examples/export.json correctly", () => {
		const filePath = resolve(__dirname, "../examples/export.json");
		const raw = readFileSync(filePath, "utf-8");
		const data = JSON.parse(raw);

		// JSON.parse leaves date strings as ISO strings; parse dates as Date objects for Zod schema
		if (Array.isArray(data.actions)) {
			for (const action of data.actions) {
				if (action.date && typeof action.date === "string") {
					action.date = new Date(action.date);
				}
			}
		}

		const parsed = BoardExport.parse(data);
		expect(parsed.name).toBeTruthy();
		expect(parsed.cards.length).toBeGreaterThan(0);
		expect(parsed.lists.length).toBeGreaterThan(0);
		expect(parsed.actions.length).toBeGreaterThan(0);
	});

	it("parses examples/map.toml correctly", () => {
		const filePath = resolve(__dirname, "../examples/map.toml");
		const raw = readFileSync(filePath, "utf-8");
		const data = TOML.parse(raw);
		const parsed = MapFormat.parse(data);

		expect(parsed.repo).toBeDefined();
		expect(parsed.labels.length).toBeGreaterThan(0);
		expect(parsed.lists.length).toBeGreaterThan(0);
	});
});
