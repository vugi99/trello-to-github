import { describe, expect, it } from "bun:test";
import {
	filterCardsByExcludedLists,
	getChecklistContentForCard,
	getCommentsForCard,
	getDescriptionForCard,
	getLabelsForCard,
	mapMemberId,
	mapMemberIds,
	resolveExcludedLists,
	type TrelloAction,
	type TrelloCard,
	type TrelloChecklist,
	type TrelloList,
	type TrelloMember,
	type ValidMember,
} from "../lib/card";
import type { Label } from "../lib/label";

describe("card conversion & formatting", () => {
	const mockCard: TrelloCard = {
		id: "c1",
		name: "Setup CI/CD",
		url: "https://trello.com/c/c1/setup-ci-cd",
		closed: false,
		desc: "Need to configure GitHub Actions pipeline.",
		idChecklists: ["chk1"],
		idList: "list1",
		idMembers: ["m1", "m2"],
		labels: [{ id: "lbl1", name: "DevOps", color: "blue", uses: 1 }],
		attachments: [
			{
				id: "att1",
				name: "pipeline.png",
				url: "https://trello.com/att1/pipeline.png",
			},
		],
	};

	const mockChecklist: TrelloChecklist = {
		id: "chk1",
		name: "Milestones",
		idCard: "c1",
		checkItems: [
			{ id: "ci1", name: "Linting", state: "complete" },
			{ id: "ci2", name: "Unit tests", state: "incomplete" },
		],
	};

	const mockMembers: TrelloMember[] = [
		{ id: "m1", fullName: "Alice Doe", username: "alicedoe" },
		{ id: "m2", fullName: "Bob Builder", username: "bobbuilder" },
	];

	const mockValidMembers: ValidMember[] = [
		{
			trelloName: "alicedoe",
			github: { data: { login: "alice-gh" } },
		},
		{
			trelloName: "Bob Builder",
			github: { data: { login: "bob-gh" } },
		},
	];

	describe("getDescriptionForCard", () => {
		it("formats full card body with description, checklists, and attachments", () => {
			const body = getDescriptionForCard(mockCard, [mockChecklist]);
			expect(body).toContain("Need to configure GitHub Actions pipeline.");
			expect(body).toContain("## Checklists");
			expect(body).toContain("### Milestones");
			expect(body).toContain("- [x] Linting");
			expect(body).toContain("- [ ] Unit tests");
			expect(body).toContain(
				"> Migrated from [Trello Card](https://trello.com/c/c1/setup-ci-cd)",
			);
			expect(body).toContain(
				"![pipeline.png](https://trello.com/att1/pipeline.png)",
			);
		});

		it("allows overriding attachment lines for custom/reuploaded assets", () => {
			const customAttachments = [
				"![pipeline.png](https://github.com/user-attachments/assets/12345)",
			];
			const body = getDescriptionForCard(
				mockCard,
				[mockChecklist],
				customAttachments,
			);
			expect(body).toContain(
				"![pipeline.png](https://github.com/user-attachments/assets/12345)",
			);
			expect(body).not.toContain("https://trello.com/att1/pipeline.png");
		});

		it("handles card with empty description and no checklists", () => {
			const emptyCard: TrelloCard = {
				...mockCard,
				desc: "",
				idChecklists: [],
				attachments: [],
			};
			const body = getDescriptionForCard(emptyCard, []);
			expect(body).toBe(
				"> Migrated from [Trello Card](https://trello.com/c/c1/setup-ci-cd)\n",
			);
		});
	});

	describe("getChecklistContentForCard", () => {
		it("returns null when card has no checklists", () => {
			const result = getChecklistContentForCard(
				{ ...mockCard, idChecklists: [] },
				[mockChecklist],
			);
			expect(result).toBeNull();
		});

		it("formats check items with checkboxes", () => {
			const result = getChecklistContentForCard(mockCard, [mockChecklist]);
			expect(result).toContain("### Milestones");
			expect(result).toContain("- [x] Linting");
			expect(result).toContain("- [ ] Unit tests");
		});
	});

	describe("mapMemberId and mapMemberIds", () => {
		it("resolves member by username or full name", () => {
			expect(mapMemberId("m1", mockMembers, mockValidMembers)).toBe("alice-gh");
			expect(mapMemberId("m2", mockMembers, mockValidMembers)).toBe("bob-gh");
		});

		it("returns null for unknown member ID", () => {
			expect(
				mapMemberId("unknown_id", mockMembers, mockValidMembers),
			).toBeNull();
		});

		it("maps list of member IDs filtering out nulls", () => {
			const ids = mapMemberIds(
				["m1", "unknown", "m2"],
				mockMembers,
				mockValidMembers,
			);
			expect(ids).toEqual(["alice-gh", "bob-gh"]);
		});
	});

	describe("getLabelsForCard", () => {
		it("maps card labels and list-mapped labels", () => {
			const mappedLabels: Label[] = [
				{
					type: "mapped",
					trello: { name: "DevOps", color: "blue" },
					github: { id: 10, name: "devops", color: "#0000ff" },
				},
				{
					type: "listMapped",
					trelloList: { id: "list1", name: "In Progress" },
					github: { id: 20, name: "status: in progress", color: "#ffff00" },
				},
			];

			const labels = getLabelsForCard(mockCard, mappedLabels);
			expect(labels).toEqual(["devops", "status: in progress"]);
		});

		it("ignores skipped labels", () => {
			const mappedLabels: Label[] = [
				{
					type: "skipped",
					trello: { name: "DevOps", color: "blue" },
				},
			];
			const labels = getLabelsForCard(mockCard, mappedLabels);
			expect(labels).toEqual([]);
		});
	});

	describe("getCommentsForCard", () => {
		it("orders comments chronologically and formats author and body", () => {
			const actions: TrelloAction[] = [
				{
					id: "a2",
					type: "commentCard",
					memberCreator: { id: "m2", username: "bobbuilder" },
					data: { idCard: "c1", text: "Second comment" },
					date: new Date("2025-01-02T10:00:00Z"),
				},
				{
					id: "a1",
					type: "commentCard",
					memberCreator: { id: "m1", username: "alicedoe" },
					data: { idCard: "c1", text: "First comment" },
					date: new Date("2025-01-01T10:00:00Z"),
				},
				{
					id: "a3",
					type: "commentCard",
					memberCreator: { id: "m1", username: "alicedoe" },
					data: { idCard: "other_card", text: "Unrelated comment" },
					date: new Date("2025-01-03T10:00:00Z"),
				},
			];

			const comments = getCommentsForCard(
				mockCard,
				actions,
				mockMembers,
				mockValidMembers,
			);

			expect(comments).toHaveLength(2);
			expect(comments[0]).toContain("@alice-gh");
			expect(comments[0]).toContain("First comment");
			expect(comments[1]).toContain("@bob-gh");
			expect(comments[1]).toContain("Second comment");
		});
	});

	describe("excluding columns / lists", () => {
		const mockLists: TrelloList[] = [
			{ id: "l1", name: "Backlog", closed: false },
			{ id: "l2", name: "In Progress", closed: false },
			{ id: "l3", name: "Archive / Old", closed: false },
			{ id: "l4", name: "Trash", closed: false },
		];

		const cards: TrelloCard[] = [
			{ ...mockCard, id: "card1", idList: "l1" },
			{ ...mockCard, id: "card2", idList: "l2" },
			{ ...mockCard, id: "card3", idList: "l3" },
			{ ...mockCard, id: "card4", idList: "l4" },
		];

		it("resolves excluded lists by exact name, case-insensitive name, and ID", () => {
			const { excludedListIds, excludedLists, invalidKeys } =
				resolveExcludedLists(mockLists, ["backlog", "l3", "NonExistent"]);

			expect(excludedListIds.has("l1")).toBe(true);
			expect(excludedListIds.has("l3")).toBe(true);
			expect(excludedListIds.size).toBe(2);
			expect(excludedLists.map((l) => l.name)).toEqual([
				"Backlog",
				"Archive / Old",
			]);
			expect(invalidKeys).toEqual(["NonExistent"]);
		});

		it("deduplicates keys and ignores empty strings", () => {
			const { excludedListIds, excludedLists } = resolveExcludedLists(
				mockLists,
				["Trash", "trash", "l4", "   "],
			);

			expect(excludedListIds.size).toBe(1);
			expect(excludedLists[0].name).toBe("Trash");
		});

		it("filters out cards belonging to excluded lists", () => {
			const { excludedListIds } = resolveExcludedLists(mockLists, [
				"Backlog",
				"Trash",
			]);
			const { includedCards, excludedCards } = filterCardsByExcludedLists(
				cards,
				excludedListIds,
			);

			expect(includedCards.map((c) => c.id)).toEqual(["card2", "card3"]);
			expect(excludedCards.map((c) => c.id)).toEqual(["card1", "card4"]);
		});
	});
});
