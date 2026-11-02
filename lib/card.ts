import type { Label } from "./label";
import type { Trello } from "./schemas";

export type TrelloCard = Trello["cards"][number];
export type TrelloChecklist = Trello["checklists"][number];
export type TrelloAction = Trello["actions"][number];
export type TrelloMember = Trello["members"][number];

export interface ValidMember {
	trelloName: string;
	github: {
		data: {
			login: string;
		};
	} | null;
}

export function mapMemberId(
	trelloMemberId: string,
	trelloMembers: TrelloMember[],
	validMembers: ValidMember[],
): string | null {
	const trelloMember = trelloMembers.find((mem) => mem.id === trelloMemberId);
	if (!trelloMember) return null;

	// Trello members can be searched by ID, username, or full name
	const member = validMembers.find((mem) =>
		[trelloMember.id, trelloMember.username, trelloMember.fullName].includes(
			mem.trelloName,
		),
	);
	if (!member?.github) return null;
	return member.github.data.login;
}

export function mapMemberIds(
	trelloMemberIds: string[],
	trelloMembers: TrelloMember[],
	validMembers: ValidMember[],
): string[] {
	return trelloMemberIds
		.map((id) => mapMemberId(id, trelloMembers, validMembers))
		.filter((m): m is string => m !== null);
}

export function getChecklistContentForCard(
	card: TrelloCard,
	allChecklists: TrelloChecklist[],
): string | null {
	const checklists = card.idChecklists
		.map((id) => allChecklists.find((checklist) => checklist.id === id))
		.filter((check): check is TrelloChecklist => check !== undefined);

	if (checklists.length < 1) {
		return null;
	}

	const res = ["\n## Checklists"];
	for (const checklist of checklists) {
		res.push(`### ${checklist.name}`);
		for (const item of checklist.checkItems) {
			if (item.state === "complete") {
				res.push(`- [x] ${item.name}`);
			} else {
				res.push(`- [ ] ${item.name}`);
			}
		}
	}

	return res.join("\n");
}

export function getDescriptionForCard(
	card: TrelloCard,
	allChecklists: TrelloChecklist[],
	customAttachmentLines?: string[],
): string {
	let body = "";
	if (card.desc.length > 0) {
		body += card.desc;
	}

	const checklistStr = getChecklistContentForCard(card, allChecklists);
	if (checklistStr) {
		if (card.desc.length > 0) {
			body += "\n\n---\n\n";
		}
		body += checklistStr;
	}

	if (card.desc.length > 0 || checklistStr) {
		body += "\n\n---\n\n";
	}
	body += `> Migrated from [Trello Card](${card.url})\n`;

	if (customAttachmentLines) {
		body += customAttachmentLines.join("\n");
	} else {
		body += card.attachments
			.map((attachment) => `- [${attachment.name}](${attachment.url})`)
			.join("\n");
	}

	return body;
}

export function getLabelsForCard(
	card: TrelloCard,
	mappedLabels: Label[],
): string[] {
	const res: string[] = [];
	for (const trelloName of card.labels.map((label) => label.name)) {
		const found = mappedLabels.find(
			(label) => "trello" in label && label.trello.name === trelloName,
		);
		if (found && "github" in found && "name" in found.github) {
			res.push(found.github.name);
		}
	}

	const listLabel = mappedLabels.find(
		(label) =>
			label.type === "listMapped" && label.trelloList.id === card.idList,
	);
	if (listLabel && "github" in listLabel && "name" in listLabel.github) {
		res.push(listLabel.github.name);
	}

	return res;
}

export function getCommentsForCard(
	card: TrelloCard,
	allActions: TrelloAction[],
	trelloMembers: TrelloMember[],
	validMembers: ValidMember[],
): string[] {
	const res: string[] = [];
	const commentActions = allActions.filter(
		(action): action is Extract<TrelloAction, { type: "commentCard" }> =>
			"type" in action &&
			action.type === "commentCard" &&
			action.data.idCard === card.id,
	);
	commentActions.sort((a, b) => a.date.getTime() - b.date.getTime());

	for (const action of commentActions) {
		const member = mapMemberId(
			action.memberCreator.id,
			trelloMembers,
			validMembers,
		);
		const memberString = member
			? `@${member}`
			: `\`@${action.memberCreator.username}\``;

		const header = `## ${memberString} • ${action.date.toLocaleDateString()}`;
		res.push(`${header}\n${action.data.text}`);
	}

	return res;
}
