import type { Octokit } from "octokit";

export type ReferenceFormat = "id" | "url" | "markdown";

export type ReferenceResolver = (
	cardKey: string,
) => number | { issueNumber: number; htmlUrl?: string } | undefined;

export interface FixReferencesOptions {
	format?: ReferenceFormat;
	repo?: { owner: string; repo: string };
}

export interface FixResult {
	text: string;
	hasChanged: boolean;
	replacedCount: number;
	references: Array<{
		cardKey: string;
		issueNumber: number;
		original: string;
		replacement: string;
	}>;
}

export interface TrelloCardReference {
	cardKey: string;
	rawUrl: string;
}

/**
 * Extracts the Trello card key (shortLink or card ID) from a URL or key string.
 */
export function extractTrelloCardKey(urlOrKey: string): string | null {
	const trimmed = urlOrKey.trim();
	if (!trimmed) return null;

	// Matches https://trello.com/c/SHORTLINK(/...)
	const cMatch = trimmed.match(
		/(?:https?:\/\/)?(?:www\.)?trello\.com\/c\/([a-zA-Z0-9]+)/i,
	);
	if (cMatch) return cMatch[1];

	// Matches https://trello.com/1/cards/CARDID (excluding attachments / previews / download)
	if (
		/\/1\/cards\/[a-zA-Z0-9]+\/(?:attachments|previews|download)/i.test(trimmed)
	) {
		return null;
	}
	const cardsMatch = trimmed.match(
		/(?:https?:\/\/)?(?:www\.)?trello\.com\/1\/cards\/([a-zA-Z0-9]+)(?:[/?#\s]|$)/i,
	);
	if (cardsMatch) return cardsMatch[1];

	// Direct shortLink or card ID (8 alphanumeric characters or 24-character hex ID)
	if (/^[a-zA-Z0-9]{8}$/.test(trimmed) || /^[a-fA-F0-9]{24}$/.test(trimmed)) {
		return trimmed;
	}

	return null;
}

/**
 * Normalizes a resolver argument to a standard function.
 */
function toResolverFunction(
	resolver: ReferenceResolver | Map<string, number>,
): ReferenceResolver {
	if (typeof resolver === "function") {
		return resolver;
	}
	return (key: string) => resolver.get(key);
}

/**
 * Replaces references to Trello cards with GitHub issue links or #ticket-id references.
 * Strictly preserves the "> Migrated from [Trello Card](...)" footer.
 */
export function fixReferencesInText(
	text: string,
	resolverInput: ReferenceResolver | Map<string, number>,
	options: FixReferencesOptions = {},
): FixResult {
	const resolver = toResolverFunction(resolverInput);
	const format = options.format || "id";
	const repo = options.repo;

	if (!text) {
		return {
			text,
			hasChanged: false,
			replacedCount: 0,
			references: [],
		};
	}

	// Step 1: Protect the migration notice so it stays intact
	const migrationPlaceholders: string[] = [];
	let workingText = text.replace(
		/>\s*Migrated from\s+\[Trello Card\]\([^)]+\)/gi,
		(match) => {
			const index = migrationPlaceholders.length;
			migrationPlaceholders.push(match);
			return `__TRELLO_MIGRATED_PRESERVED_${index}__`;
		},
	);

	const references: FixResult["references"] = [];

	const resolveIssue = (
		cardKey: string,
	): { issueNumber: number; htmlUrl?: string } | null => {
		const res = resolver(cardKey);
		if (res === undefined || res === null) return null;
		if (typeof res === "number") {
			return { issueNumber: res };
		}
		return res;
	};

	const formatReference = (
		issueNumber: number,
		customAnchorText?: string,
		htmlUrl?: string,
	): string => {
		const targetUrl =
			htmlUrl ||
			(repo
				? `https://github.com/${repo.owner}/${repo.repo}/issues/${issueNumber}`
				: "");

		// If there is custom anchor text (like [See Bug](...)), we must format it as a markdown link
		if (customAnchorText) {
			if (targetUrl) {
				return `[${customAnchorText}](${targetUrl})`;
			}
			return `[${customAnchorText}](#${issueNumber})`;
		}

		if (format === "url" && targetUrl) {
			return targetUrl;
		}

		if (format === "markdown") {
			if (targetUrl) {
				return `[#${issueNumber}](${targetUrl})`;
			}
			return `[#${issueNumber}](#${issueNumber})`;
		}

		// Default: shorthand "#ticket-id"
		return `#${issueNumber}`;
	};

	// Step 2: Replace markdown links [text](https://trello.com/c/... "optional title")
	// Matches [text](url) where url is a Trello card link
	const markdownLinkRegex =
		/\[([^\]]*)\]\(\s*(https?:\/\/(?:www\.)?trello\.com\/c\/([a-zA-Z0-9]+)[^\s)"']*)(?:\s+(?:["'][^"']*["']))?\s*\)/gi;

	workingText = workingText.replace(
		markdownLinkRegex,
		(fullMatch, linkText: string, fullUrl: string, cardKey: string) => {
			const resolved = resolveIssue(cardKey);
			if (!resolved) return fullMatch;

			const trimmedText = linkText.trim();
			// Check if the link text was just the URL itself or a raw idShort (e.g. "#566")
			const isUrlOrIdText =
				!trimmedText ||
				trimmedText === fullUrl.trim() ||
				trimmedText.startsWith("https://trello.com/c/") ||
				trimmedText.startsWith("http://trello.com/c/") ||
				trimmedText.startsWith("https://www.trello.com/c/") ||
				/^#?\d+$/.test(trimmedText);

			const replacement = isUrlOrIdText
				? formatReference(resolved.issueNumber, undefined, resolved.htmlUrl)
				: formatReference(resolved.issueNumber, trimmedText, resolved.htmlUrl);

			references.push({
				cardKey,
				issueNumber: resolved.issueNumber,
				original: fullMatch,
				replacement,
			});

			return replacement;
		},
	);

	// Step 3: Replace angle bracket URLs <https://trello.com/c/...>
	const angleBracketRegex =
		/<(https?:\/\/(?:www\.)?trello\.com\/c\/([a-zA-Z0-9]+)[^>]*)>/gi;

	workingText = workingText.replace(
		angleBracketRegex,
		(fullMatch, _fullUrl: string, cardKey: string) => {
			const resolved = resolveIssue(cardKey);
			if (!resolved) return fullMatch;

			const replacement = formatReference(
				resolved.issueNumber,
				undefined,
				resolved.htmlUrl,
			);

			references.push({
				cardKey,
				issueNumber: resolved.issueNumber,
				original: fullMatch,
				replacement,
			});

			return replacement;
		},
	);

	// Step 4: Replace bare Trello card URLs in plain text
	// Be careful to preserve trailing punctuation like '.', ',', ';', ')', ']'
	const bareUrlRegex =
		/(https?:\/\/(?:www\.)?trello\.com\/c\/([a-zA-Z0-9]+)[^\s)"'>]*)/gi;

	workingText = workingText.replace(
		bareUrlRegex,
		(fullMatch, fullUrl: string, cardKey: string) => {
			const resolved = resolveIssue(cardKey);
			if (!resolved) return fullMatch;

			// Extract any trailing punctuation
			const punctMatch = fullUrl.match(/[.,;:!?)]+$/);
			const trailingPunct = punctMatch ? punctMatch[0] : "";
			const cleanUrl = trailingPunct
				? fullUrl.slice(0, -trailingPunct.length)
				: fullUrl;

			const replacement =
				formatReference(resolved.issueNumber, undefined, resolved.htmlUrl) +
				trailingPunct;

			references.push({
				cardKey,
				issueNumber: resolved.issueNumber,
				original: cleanUrl,
				replacement: replacement.slice(
					0,
					replacement.length - trailingPunct.length,
				),
			});

			return replacement;
		},
	);

	// Step 5: Restore the preserved migration notices
	const finalText = workingText.replace(
		/__TRELLO_MIGRATED_PRESERVED_(\d+)__/g,
		(_, indexStr) => migrationPlaceholders[Number(indexStr)] ?? "",
	);

	return {
		text: finalText,
		hasChanged: finalText !== text,
		replacedCount: references.length,
		references,
	};
}

/**
 * Builds a mapping of Trello card identifiers (shortLink, URL, ID) to GitHub issue numbers
 * based on GitHub issue bodies (which contain "> Migrated from [Trello Card](...)")
 * and optionally an exported Trello board.
 */
export function buildTrelloToGitHubMapFromIssues(
	issues: Array<{ number: number; body?: string | null; title?: string }>,
	trelloCards?: Array<{
		id: string;
		shortLink?: string;
		shortUrl?: string;
		url?: string;
		name?: string;
		idShort?: number;
	}>,
): Map<string, number> {
	const map = new Map<string, number>();

	// First pass: extract from GitHub issue bodies
	for (const issue of issues) {
		if (!issue.body) continue;

		// Match "> Migrated from [Trello Card](URL)"
		const match = issue.body.match(
			/>\s*Migrated from\s+\[Trello Card\]\((https?:\/\/[^\s)]+)\)/i,
		);
		if (!match) continue;

		const fullUrl = match[1];
		map.set(fullUrl, issue.number);

		const cardKey = extractTrelloCardKey(fullUrl);
		if (cardKey) {
			map.set(cardKey, issue.number);
			map.set(`https://trello.com/c/${cardKey}`, issue.number);
		}
	}

	// Second pass: if Trello cards export was provided, map card.id, card.url, etc.
	if (trelloCards && trelloCards.length > 0) {
		for (const card of trelloCards) {
			let issueNumber: number | undefined;
			const shortLink =
				card.shortLink || (card.url ? extractTrelloCardKey(card.url) : null);

			if (shortLink && map.has(shortLink)) {
				issueNumber = map.get(shortLink);
			} else if (card.url && map.has(card.url)) {
				issueNumber = map.get(card.url);
			} else if (card.shortUrl && map.has(card.shortUrl)) {
				issueNumber = map.get(card.shortUrl);
			} else if (card.id && map.has(card.id)) {
				issueNumber = map.get(card.id);
			} else if (card.name) {
				// Fallback matching by exact title
				const matchingIssue = issues.find((i) => i.title === card.name);
				if (matchingIssue) {
					issueNumber = matchingIssue.number;
				}
			}

			if (issueNumber !== undefined) {
				if (card.id) map.set(card.id, issueNumber);
				if (shortLink) map.set(shortLink, issueNumber);
				if (card.shortUrl) map.set(card.shortUrl, issueNumber);
				if (card.url) map.set(card.url, issueNumber);
			}
		}
	}

	return map;
}

export interface FixRepositoryReferencesOptions {
	octokit: Octokit;
	owner: string;
	repo: string;
	cardToIssueMap?: Map<string, number>;
	trelloCards?: Array<{
		id: string;
		shortLink?: string;
		shortUrl?: string;
		url?: string;
		name?: string;
		idShort?: number;
	}>;
	dryRun?: boolean;
	format?: ReferenceFormat;
	targetIssueNumber?: number;
	onLog?: (message: string) => void;
}

export interface FixRepositoryReferencesResult {
	scannedIssues: number;
	updatedIssues: number;
	scannedComments: number;
	updatedComments: number;
	totalReplacements: number;
}

/**
 * Scans a GitHub repository for issues and comments with Trello card links,
 * and updates ONLY the contents that need changes.
 */
export async function fixRepositoryReferences({
	octokit,
	owner,
	repo,
	cardToIssueMap,
	trelloCards,
	dryRun = false,
	format = "id",
	targetIssueNumber,
	onLog = () => {},
}: FixRepositoryReferencesOptions): Promise<FixRepositoryReferencesResult> {
	const defaultHeaders = { "X-GitHub-Api-Version": "2022-11-28" };

	// 1. Fetch issues to build mapping and inspect
	onLog(`Fetching issues from ${owner}/${repo}...`);
	// biome-ignore lint/suspicious/noExplicitAny: Octokit issue data
	const allIssues: any[] = await octokit.paginate(
		octokit.rest.issues.listForRepo,
		{
			owner,
			repo,
			state: "all",
			per_page: 100,
			headers: defaultHeaders,
		},
	);

	onLog(`Found ${allIssues.length} issues in ${owner}/${repo}`);

	// 2. Build or complement cardToIssueMap
	let mapping = cardToIssueMap;
	if (!mapping || mapping.size === 0) {
		onLog("Building Trello card to GitHub issue mapping from issues...");
		mapping = buildTrelloToGitHubMapFromIssues(allIssues, trelloCards);
	} else if (trelloCards && trelloCards.length > 0) {
		// Ensure all representations of card keys are mapped
		mapping = buildTrelloToGitHubMapFromIssues(allIssues, trelloCards);
		if (cardToIssueMap) {
			for (const [k, v] of cardToIssueMap.entries()) {
				mapping.set(k, v);
			}
		}
	}
	onLog(`Resolved ${mapping.size} Trello card reference keys.`);

	const issuesToInspect = targetIssueNumber
		? allIssues.filter((i) => i.number === targetIssueNumber)
		: allIssues;

	let updatedIssues = 0;
	let scannedComments = 0;
	let updatedComments = 0;
	let totalReplacements = 0;

	// 3. Scan and update issues
	for (const issue of issuesToInspect) {
		// Issues and pull requests share the endpoint; skip pull requests if any
		if (issue.pull_request) continue;

		const body = issue.body || "";
		const fixResult = fixReferencesInText(body, mapping, {
			format,
			repo: { owner, repo },
		});

		if (fixResult.hasChanged) {
			totalReplacements += fixResult.replacedCount;
			updatedIssues++;

			if (dryRun) {
				onLog(
					`[dry-run] Would update issue #${issue.number} ("${issue.title}"): replaced ${fixResult.replacedCount} reference(s)`,
				);
			} else {
				onLog(
					`Updating issue #${issue.number} ("${issue.title}"): fixing ${fixResult.replacedCount} reference(s)...`,
				);
				await octokit.request(
					"PATCH /repos/{owner}/{repo}/issues/{issue_number}",
					{
						owner,
						repo,
						issue_number: issue.number,
						body: fixResult.text,
						headers: defaultHeaders,
					},
				);
			}
		}

		// 4. Scan comments for this issue if it has comments
		if (issue.comments > 0) {
			const comments = await octokit.paginate(
				octokit.rest.issues.listComments,
				{
					owner,
					repo,
					issue_number: issue.number,
					per_page: 100,
					headers: defaultHeaders,
				},
			);

			scannedComments += comments.length;

			for (const comment of comments) {
				const commentBody = comment.body || "";
				const commentResult = fixReferencesInText(commentBody, mapping, {
					format,
					repo: { owner, repo },
				});

				if (commentResult.hasChanged) {
					totalReplacements += commentResult.replacedCount;
					updatedComments++;

					if (dryRun) {
						onLog(
							`[dry-run] Would update comment ${comment.id} on issue #${issue.number}: replaced ${commentResult.replacedCount} reference(s)`,
						);
					} else {
						onLog(
							`Updating comment ${comment.id} on issue #${issue.number}: fixing ${commentResult.replacedCount} reference(s)...`,
						);
						await octokit.request(
							"PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}",
							{
								owner,
								repo,
								comment_id: comment.id,
								body: commentResult.text,
								headers: defaultHeaders,
							},
						);
					}
				}
			}
		}
	}

	return {
		scannedIssues: allIssues.length,
		updatedIssues,
		scannedComments,
		updatedComments,
		totalReplacements,
	};
}
