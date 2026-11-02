export const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
	"tiff",
]);

export function getFileExtension(filenameOrUrl: string): string {
	try {
		const clean = filenameOrUrl.split("?")[0].split("#")[0];
		const lastDot = clean.lastIndexOf(".");
		if (lastDot === -1) return "";
		return clean.slice(lastDot + 1).toLowerCase();
	} catch {
		return "";
	}
}

export function isImageFile(filename: string, url = ""): boolean {
	const extName = getFileExtension(filename);
	if (IMAGE_EXTENSIONS.has(extName)) return true;

	const extUrl = getFileExtension(url);
	if (IMAGE_EXTENSIONS.has(extUrl)) return true;

	if (url.includes("/previews/") || url.includes("/download/image.")) {
		return true;
	}

	return false;
}

export function getMimeType(filename: string): string {
	const ext = getFileExtension(filename);
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "svg":
			return "image/svg+xml";
		case "bmp":
			return "image/bmp";
		case "ico":
			return "image/x-icon";
		default:
			return "application/octet-stream";
	}
}

export type FetchFn = (
	input: RequestInfo | URL | string,
	init?: RequestInit,
) => Promise<Response>;

export interface TrelloAuth {
	key?: string;
	token?: string;
}

export function buildTrelloHeaders(auth?: TrelloAuth): HeadersInit {
	const headers: Record<string, string> = {
		Accept: "*/*",
	};
	if (auth?.key && auth?.token) {
		headers.Authorization = `OAuth oauth_consumer_key="${auth.key}", oauth_token="${auth.token}"`;
	}
	return headers;
}

/**
 * Downloads an image from Trello.
 */
export async function downloadImage(
	url: string,
	auth?: TrelloAuth,
	customFetch: FetchFn = fetch as FetchFn,
): Promise<{ buffer: Uint8Array; contentType: string } | null> {
	try {
		const headers = buildTrelloHeaders(auth);
		const response = await customFetch(url, {
			headers,
			redirect: "follow",
		});

		if (!response.ok) {
			return null;
		}

		const arrayBuffer = await response.arrayBuffer();
		const buffer = new Uint8Array(arrayBuffer);
		const rawContentType = response.headers.get("content-type");
		const contentType =
			rawContentType && rawContentType !== "application/octet-stream"
				? rawContentType
				: getMimeType(url);

		return { buffer, contentType };
	} catch {
		return null;
	}
}

/**
 * Uploads an image binary to GitHub user-attachments backend.
 */
export async function uploadImageToGitHub(
	buffer: Uint8Array,
	filename: string,
	contentType: string,
	repositoryId: number | string | bigint,
	githubToken: string,
	customFetch: FetchFn = fetch as FetchFn,
): Promise<string> {
	const uploadUrl = `https://uploads.github.com/user-attachments/assets?name=${encodeURIComponent(
		filename,
	)}&content_type=${encodeURIComponent(
		contentType,
	)}&repository_id=${repositoryId.toString()}`;

	const response = await customFetch(uploadUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${githubToken}`,
			Accept: "application/json",
			"Content-Type": contentType,
		},
		body: buffer as unknown as BodyInit,
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => "");
		throw new Error(
			`GitHub asset upload failed [${response.status}]: ${errorText}`,
		);
	}

	const data = (await response.json()) as { href?: string; url?: string };
	const assetUrl = data.href || data.url;
	if (!assetUrl) {
		throw new Error("GitHub asset upload did not return asset URL");
	}

	return assetUrl;
}

/**
 * Finds all inline image URLs formatted as ![alt](url) in markdown text.
 */
export function extractMarkdownImageUrls(
	markdown: string,
): Array<{ alt: string; url: string; raw: string }> {
	const regex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
	const matches: Array<{ alt: string; url: string; raw: string }> = [];

	let match: RegExpExecArray | null = null;
	while (true) {
		match = regex.exec(markdown);
		if (!match) break;
		matches.push({
			alt: match[1],
			url: match[2],
			raw: match[0],
		});
	}

	return matches;
}

/**
 * Replaces old image URLs with new uploaded URLs in markdown content.
 */
export function rewriteMarkdownImages(
	markdown: string,
	urlMap: Map<string, string>,
): string {
	if (!markdown || urlMap.size === 0) return markdown;

	let result = markdown;
	for (const [oldUrl, newUrl] of urlMap.entries()) {
		result = result.replaceAll(oldUrl, newUrl);
	}
	return result;
}

export interface ProcessImageOptions {
	dryRun?: boolean;
	repositoryId?: number | string | bigint;
	githubToken?: string;
	trelloAuth?: TrelloAuth;
	customFetch?: FetchFn;
	onLog?: (message: string) => void;
}

/**
 * Downloads and re-uploads images for a card (attachments, markdown description, and comments).
 * In dry-run mode, downloads and verifies images, producing simulated GitHub asset URLs.
 */
export async function processImagesForCard(
	card: {
		desc: string;
		attachments?: Array<{ id?: string; name: string; url: string }>;
	},
	comments: string[] = [],
	options: ProcessImageOptions = {},
): Promise<Map<string, string>> {
	const imageUrlMap = new Map<string, string>();
	const candidates: Array<{ url: string; name: string }> = [];

	for (const att of card.attachments || []) {
		// If attachment is already referenced in description (by URL or attachment ID),
		// it will be picked up by extractMarkdownImageUrls(card.desc) below.
		if (
			card.desc &&
			(card.desc.includes(att.url) || (att.id && card.desc.includes(att.id)))
		) {
			continue;
		}
		if (isImageFile(att.name, att.url)) {
			candidates.push({ url: att.url, name: att.name });
		}
	}

	for (const img of extractMarkdownImageUrls(card.desc)) {
		candidates.push({ url: img.url, name: img.alt || "image" });
	}

	for (const comment of comments) {
		for (const img of extractMarkdownImageUrls(comment)) {
			candidates.push({ url: img.url, name: img.alt || "image" });
		}
	}

	// Deduplicate candidates by URL
	const uniqueCandidates = new Map<string, string>();
	for (const { url, name } of candidates) {
		if (!uniqueCandidates.has(url)) {
			uniqueCandidates.set(url, name);
		}
	}

	for (const [url, name] of uniqueCandidates.entries()) {
		if (options.dryRun) {
			const downloaded = await downloadImage(
				url,
				options.trelloAuth,
				options.customFetch,
			);
			const simulatedId = `dry-run-${crypto.randomUUID().slice(0, 8)}`;
			const simulatedUrl = `https://github.com/user-attachments/assets/${simulatedId}`;
			imageUrlMap.set(url, simulatedUrl);

			const effectiveType =
				downloaded && downloaded.contentType !== "application/octet-stream"
					? downloaded.contentType
					: getMimeType(name || url);

			const sizeInfo = downloaded
				? `${downloaded.buffer.length} bytes, ${effectiveType}`
				: "download skipped / unavailable";
			options.onLog?.(
				`[dry-run] Image "${name}": verified (${sizeInfo}), simulated upload -> ${simulatedUrl}`,
			);
		} else {
			const downloaded = await downloadImage(
				url,
				options.trelloAuth,
				options.customFetch,
			);
			if (!downloaded) {
				options.onLog?.(
					`Warning: Failed to download image "${name}" from ${url}. Skipping re-upload.`,
				);
				continue;
			}

			if (!options.repositoryId || !options.githubToken) {
				options.onLog?.(
					`Warning: Missing repositoryId or githubToken to upload "${name}". Skipping re-upload.`,
				);
				continue;
			}

			const effectiveType =
				downloaded.contentType !== "application/octet-stream"
					? downloaded.contentType
					: getMimeType(name || url);

			try {
				const uploadedUrl = await uploadImageToGitHub(
					downloaded.buffer,
					name,
					effectiveType,
					options.repositoryId,
					options.githubToken,
					options.customFetch,
				);
				imageUrlMap.set(url, uploadedUrl);
				options.onLog?.(
					`Uploaded image "${name}" (${downloaded.buffer.length} bytes) -> ${uploadedUrl}`,
				);
			} catch (err) {
				options.onLog?.(
					`Warning: Failed to upload image "${name}" to GitHub: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	return imageUrlMap;
}
