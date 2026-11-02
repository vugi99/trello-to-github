import { describe, expect, it } from "vitest";
import {
	renderGithubFieldOption,
	renderGithubLabel,
	renderTrelloLabel,
} from "../lib/label";

describe("label rendering", () => {
	it("renders supported Trello labels with color styling", () => {
		const renderedLime = renderTrelloLabel({
			type: "skipped",
			trello: { name: "Low Priority", color: "lime" },
		});
		expect(renderedLime).toContain("Low Priority");

		const renderedRed = renderTrelloLabel({
			type: "toCreate",
			trello: { name: "Critical", color: "red" },
			github: { name: "critical" },
		});
		expect(renderedRed).toContain("Critical");
	});

	it("throws an error when Trello label has an invalid color", () => {
		expect(() =>
			renderTrelloLabel({
				type: "skipped",
				// @ts-expect-error testing invalid color
				trello: { name: "Bad", color: "non_existent_color" },
			}),
		).toThrow(/should be a valid Trello color/);
	});

	it("renders Github toCreate label without color", () => {
		const rendered = renderGithubLabel({
			type: "toCreate",
			trello: { name: "Bug", color: "red" },
			github: { name: "bug" },
		});
		expect(rendered).toContain("Will create:");
		expect(rendered).toContain("bug");
	});

	it("renders Github toCreate label with custom hex color", () => {
		const rendered = renderGithubLabel({
			type: "toCreate",
			trello: { name: "Feature", color: "green" },
			github: { name: "feature", color: "#00ff00" },
		});
		expect(rendered).toContain("Will create:");
		expect(rendered).toContain("feature");
	});

	it("renders Github mapped and listMapped labels", () => {
		const mapped = renderGithubLabel({
			type: "mapped",
			trello: { name: "Bug", color: "red" },
			github: { id: 1, name: "bug", color: "#d73a4a" },
		});
		expect(mapped).toContain("bug");

		const listMapped = renderGithubLabel({
			type: "listMapped",
			trelloList: { id: "l1", name: "Backlog" },
			github: { id: 2, name: "status: backlog", color: "#0075ca" },
		});
		expect(listMapped).toContain("status: backlog");
	});

	it("renders Github Project field option with status circle", () => {
		const rendered = renderGithubFieldOption({
			id: "opt1",
			name: "In Progress",
			color: "BLUE",
		});
		expect(rendered).toContain("In Progress");
		expect(rendered).toContain("●");
	});
});
