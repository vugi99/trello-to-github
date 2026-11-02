import { describe, expect, it } from "bun:test";
import {
	buildTrelloHeaders,
	downloadImage,
	extractMarkdownImageUrls,
	type FetchFn,
	getFileExtension,
	getMimeType,
	isImageFile,
	processImagesForCard,
	rewriteMarkdownImages,
	uploadImageToGitHub,
} from "../lib/image";

describe("image processing utilities", () => {
	describe("getFileExtension & isImageFile", () => {
		it("extracts extension ignoring query params and hash fragments", () => {
			expect(getFileExtension("photo.PNG?width=100")).toBe("png");
			expect(getFileExtension("https://example.com/image.webp#hash")).toBe(
				"webp",
			);
			expect(getFileExtension("no-extension")).toBe("");
		});

		it("detects image files from filename or URL", () => {
			expect(isImageFile("screenshot.png")).toBe(true);
			expect(isImageFile("photo.jpg")).toBe(true);
			expect(isImageFile("banner.svg")).toBe(true);
			expect(
				isImageFile(
					"unnamed",
					"https://trello.com/1/cards/c1/attachments/a1/download/image.png",
				),
			).toBe(true);
			expect(
				isImageFile(
					"preview",
					"https://trello.com/1/cards/c1/attachments/a1/previews/preview/download/image.webp",
				),
			).toBe(true);
		});

		it("returns false for non-image files and card links", () => {
			expect(isImageFile("document.pdf")).toBe(false);
			expect(isImageFile("archive.zip")).toBe(false);
			expect(
				isImageFile(
					"card-link",
					"https://trello.com/c/tCEGfvR3/57-static-level-intervals",
				),
			).toBe(false);
		});
	});

	describe("getMimeType", () => {
		it("returns correct MIME types for images", () => {
			expect(getMimeType("img.png")).toBe("image/png");
			expect(getMimeType("img.jpeg")).toBe("image/jpeg");
			expect(getMimeType("img.jpg")).toBe("image/jpeg");
			expect(getMimeType("img.webp")).toBe("image/webp");
			expect(getMimeType("img.svg")).toBe("image/svg+xml");
			expect(getMimeType("unknown.ext")).toBe("application/octet-stream");
		});
	});

	describe("buildTrelloHeaders", () => {
		it("adds OAuth authorization header when key and token are present", () => {
			const headers = buildTrelloHeaders({ key: "k1", token: "t1" }) as Record<
				string,
				string
			>;
			expect(headers.Authorization).toBe(
				'OAuth oauth_consumer_key="k1", oauth_token="t1"',
			);
		});

		it("omits authorization header when credentials are not supplied", () => {
			const headers = buildTrelloHeaders() as Record<string, string>;
			expect(headers.Authorization).toBeUndefined();
		});
	});

	describe("downloadImage", () => {
		it("downloads image bytes successfully", async () => {
			const mockBuffer = new Uint8Array([1, 2, 3, 4]);
			const mockFetch: FetchFn = async () =>
				new Response(mockBuffer, {
					status: 200,
					headers: { "content-type": "image/png" },
				});

			const result = await downloadImage(
				"https://trello.com/image.png",
				undefined,
				mockFetch,
			);
			expect(result).not.toBeNull();
			expect(result?.contentType).toBe("image/png");
			expect(result?.buffer).toEqual(mockBuffer);
		});

		it("returns null on 401 or 403 error", async () => {
			const mockFetch: FetchFn = async () =>
				new Response("Forbidden", { status: 403 });

			const result = await downloadImage(
				"https://trello.com/image.png",
				undefined,
				mockFetch,
			);
			expect(result).toBeNull();
		});
	});

	describe("uploadImageToGitHub", () => {
		it("uploads binary to user-attachments endpoint and returns asset href", async () => {
			let capturedUrl = "";
			let capturedHeaders: HeadersInit | undefined;

			const mockFetch: FetchFn = async (url, init) => {
				capturedUrl = url.toString();
				capturedHeaders = init?.headers;
				return new Response(
					JSON.stringify({
						id: 12345,
						name: "test.png",
						href: "https://github.com/user-attachments/assets/abcd-1234",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			};

			const buffer = new Uint8Array([10, 20, 30]);
			const assetUrl = await uploadImageToGitHub(
				buffer,
				"test.png",
				"image/png",
				999999,
				"ghp_secret",
				mockFetch,
			);

			expect(assetUrl).toBe(
				"https://github.com/user-attachments/assets/abcd-1234",
			);
			expect(capturedUrl).toContain("repository_id=999999");
			expect(capturedUrl).toContain("name=test.png");
			expect((capturedHeaders as Record<string, string>).Authorization).toBe(
				"Bearer ghp_secret",
			);
		});

		it("throws an error if GitHub returns non-200", async () => {
			const mockFetch: FetchFn = async () =>
				new Response("Bad Request", { status: 400 });

			const buffer = new Uint8Array([1, 2]);
			expect(
				uploadImageToGitHub(
					buffer,
					"bad.png",
					"image/png",
					1,
					"token",
					mockFetch,
				),
			).rejects.toThrow(/GitHub asset upload failed/);
		});
	});

	describe("extractMarkdownImageUrls and rewriteMarkdownImages", () => {
		const sampleMarkdown =
			"Here is an image:\n![Screenshot](https://trello.com/1/cards/c1/attachments/a1/download/image.png)\nAnd another:\n![Banner](https://trello-attachments.s3.amazonaws.com/abc/banner.jpg)";

		it("extracts all image markdown tags", () => {
			const images = extractMarkdownImageUrls(sampleMarkdown);
			expect(images).toHaveLength(2);
			expect(images[0].alt).toBe("Screenshot");
			expect(images[0].url).toBe(
				"https://trello.com/1/cards/c1/attachments/a1/download/image.png",
			);
			expect(images[1].alt).toBe("Banner");
			expect(images[1].url).toBe(
				"https://trello-attachments.s3.amazonaws.com/abc/banner.jpg",
			);
		});

		it("rewrites markdown image URLs with new asset links", () => {
			const urlMap = new Map([
				[
					"https://trello.com/1/cards/c1/attachments/a1/download/image.png",
					"https://github.com/user-attachments/assets/1111",
				],
				[
					"https://trello-attachments.s3.amazonaws.com/abc/banner.jpg",
					"https://github.com/user-attachments/assets/2222",
				],
			]);

			const rewritten = rewriteMarkdownImages(sampleMarkdown, urlMap);
			expect(rewritten).toContain(
				"![Screenshot](https://github.com/user-attachments/assets/1111)",
			);
			expect(rewritten).toContain(
				"![Banner](https://github.com/user-attachments/assets/2222)",
			);
			expect(rewritten).not.toContain("https://trello.com");
			expect(rewritten).not.toContain("https://trello-attachments");
		});
	});

	describe("processImagesForCard", () => {
		it("processes attachments and inline markdown images in dry-run mode", async () => {
			const mockCard = {
				desc: "Card with ![inline](https://trello.com/inline.png)",
				attachments: [
					{
						name: "file.png",
						url: "https://trello.com/attachment.png",
					},
					{
						name: "document.pdf",
						url: "https://trello.com/doc.pdf",
					},
				],
			};

			const mockFetch: FetchFn = async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "content-type": "image/png" },
				});

			const logs: string[] = [];
			const urlMap = await processImagesForCard(
				mockCard,
				["Comment with ![pic](https://trello.com/comment.png)"],
				{
					dryRun: true,
					customFetch: mockFetch,
					onLog: (msg) => logs.push(msg),
				},
			);

			expect(urlMap.size).toBe(3);
			expect(urlMap.has("https://trello.com/attachment.png")).toBe(true);
			expect(urlMap.has("https://trello.com/inline.png")).toBe(true);
			expect(urlMap.has("https://trello.com/comment.png")).toBe(true);
			expect(urlMap.has("https://trello.com/doc.pdf")).toBe(false);

			expect(urlMap.get("https://trello.com/attachment.png")).toMatch(
				/^https:\/\/github\.com\/user-attachments\/assets\/dry-run-/,
			);
			expect(logs.length).toBe(3);
		});

		it("downloads and re-uploads images in non-dry-run mode", async () => {
			const mockCard = {
				desc: "Check this screenshot ![screen](https://trello.com/screen.png)",
				attachments: [
					{
						name: "screen.png",
						url: "https://trello.com/screen.png",
					},
				],
			};

			const mockFetch: FetchFn = async (_url, init) => {
				if (init?.method === "POST") {
					return new Response(
						JSON.stringify({
							href: "https://github.com/user-attachments/assets/gh-asset-1",
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					);
				}
				return new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "content-type": "image/png" },
				});
			};

			const logs: string[] = [];
			const urlMap = await processImagesForCard(mockCard, [], {
				dryRun: false,
				repositoryId: 12345,
				githubToken: "ghp_test",
				customFetch: mockFetch,
				onLog: (msg) => logs.push(msg),
			});

			// Deduplication: screen.png was in both attachment and inline desc
			expect(urlMap.size).toBe(1);
			expect(urlMap.get("https://trello.com/screen.png")).toBe(
				"https://github.com/user-attachments/assets/gh-asset-1",
			);
			expect(logs.some((l) => l.includes("Uploaded image"))).toBe(true);
		});

		it("skips attachment candidate when preview of attachment is already embedded in description", async () => {
			const mockCard = {
				desc: "Preview: ![preview](https://trello.com/1/cards/c1/attachments/att99/previews/prev1/download/image.webp)",
				attachments: [
					{
						id: "att99",
						name: "image.png",
						url: "https://trello.com/1/cards/c1/attachments/att99/download/image.png",
					},
				],
			};

			const mockFetch: FetchFn = async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "content-type": "image/webp" },
				});

			const urlMap = await processImagesForCard(mockCard, [], {
				dryRun: true,
				customFetch: mockFetch,
			});

			expect(urlMap.size).toBe(1);
			expect(
				urlMap.has(
					"https://trello.com/1/cards/c1/attachments/att99/previews/prev1/download/image.webp",
				),
			).toBe(true);
			expect(
				urlMap.has(
					"https://trello.com/1/cards/c1/attachments/att99/download/image.png",
				),
			).toBe(false);
		});
	});
});
