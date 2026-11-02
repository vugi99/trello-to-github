import { describe, expect, it } from "bun:test";
import { BoardExport, MapFormat } from "../lib/schemas";

describe("schemas", () => {
	describe("BoardExport schema", () => {
		it("validates a minimal valid Trello export", () => {
			const minimal = {
				name: "Test Board",
				lists: [{ id: "l1", name: "To Do", closed: false }],
				members: [{ id: "m1", fullName: "Alice Smith", username: "alice" }],
				actions: [
					{
						id: "a1",
						memberCreator: { id: "m1", username: "alice" },
						data: { idCard: "c1", text: "First comment" },
						type: "commentCard",
						date: new Date("2025-01-01T12:00:00Z"),
					},
				],
				cards: [
					{
						id: "c1",
						name: "Card 1",
						url: "https://trello.com/c/c1",
						closed: false,
						desc: "Card description",
						idChecklists: ["chk1"],
						idList: "l1",
						idMembers: ["m1"],
						labels: [{ id: "lbl1", name: "Bug", color: "red", uses: 1 }],
						attachments: [
							{
								id: "att1",
								name: "screenshot.png",
								url: "https://trello.com/att1/screenshot.png",
							},
						],
					},
				],
				labels: [{ id: "lbl1", name: "Bug", color: "red", uses: 1 }],
				checklists: [
					{
						id: "chk1",
						name: "Tasks",
						idCard: "c1",
						checkItems: [
							{ id: "ci1", name: "Task 1", state: "complete" as const },
							{ id: "ci2", name: "Task 2", state: "incomplete" as const },
						],
					},
				],
			};

			const parsed = BoardExport.parse(minimal);
			expect(parsed.name).toBe("Test Board");
			expect(parsed.cards).toHaveLength(1);
			expect(parsed.lists).toHaveLength(1);
			expect(parsed.actions).toHaveLength(1);
		});

		it("rejects board export missing required fields", () => {
			expect(() => BoardExport.parse({})).toThrow();
			expect(() => BoardExport.parse({ name: "Board Only" })).toThrow();
		});

		it("ignores and strips unrecognized action types", () => {
			const board = {
				name: "Test Board",
				lists: [],
				members: [],
				actions: [
					{ type: "updateCard", id: "a2" },
					{
						id: "a1",
						memberCreator: { id: "m1", username: "alice" },
						data: { idCard: "c1", text: "Comment" },
						type: "commentCard",
						date: new Date(),
					},
				],
				cards: [],
				labels: [],
				checklists: [],
			};

			const parsed = BoardExport.parse(board);
			expect(parsed.actions).toHaveLength(2);
		});
	});

	describe("MapFormat schema", () => {
		it("validates map with string repo owner", () => {
			const mapData = {
				repo: {
					owner: "octocat",
					repo: "hello-world",
				},
				project: 123,
				labels: [
					{
						trello: "Bug",
						github: "bug",
						create: false,
					},
					{
						trello: "Feature",
						github: "enhancement",
						create: true,
						color: "#a2eeef",
					},
				],
				users: [
					{
						trello: "@alice",
						github: "alice-gh",
					},
				],
				lists: [
					{
						list: "In Progress",
						status: "In Progress",
						create: true,
					},
				],
			};

			const parsed = MapFormat.parse(mapData);
			expect(parsed.repo.owner).toBe("octocat");
			expect(parsed.repo.repo).toBe("hello-world");
			expect(parsed.project).toBe(123);
			expect(parsed.labels).toHaveLength(2);
			expect(parsed.lists).toHaveLength(1);
			expect(parsed.users).toHaveLength(1);
		});

		it("validates map with organization repo owner", () => {
			const mapData = {
				repo: {
					owner: {
						type: "organization" as const,
						login: "my-org",
					},
					repo: "my-repo",
				},
				labels: [],
			};

			const parsed = MapFormat.parse(mapData);
			expect(parsed.repo.owner).toEqual({
				type: "organization",
				login: "my-org",
			});
		});

		it("validates map with skip.lists, skip.columns, and lists[].skip", () => {
			const mapData = {
				repo: { owner: "user", repo: "repo" },
				labels: [],
				lists: [
					{
						list: "Discarded",
						skip: true,
					},
					{
						list: "To Do",
						status: "Todo",
					},
				],
				skip: {
					lists: ["Trash"],
					columns: ["Archived Ideas"],
				},
			};

			const parsed = MapFormat.parse(mapData);
			expect(parsed.lists[0].skip).toBe(true);
			expect(parsed.lists[1].skip).toBe(false);
			expect(parsed.skip.lists).toEqual(["Trash"]);
			expect(parsed.skip.columns).toEqual(["Archived Ideas"]);
		});

		it("rejects map with invalid label color format", () => {
			const mapData = {
				repo: { owner: "user", repo: "repo" },
				labels: [
					{
						trello: "Bug",
						github: "bug",
						create: true,
						color: "invalid-color",
					},
				],
			};

			expect(() => MapFormat.parse(mapData)).toThrow();
		});
	});
});
