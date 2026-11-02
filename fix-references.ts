#!/usr/bin/env bun

import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { Octokit } from "octokit";
import TOML from "smol-toml";
import terminalLink from "terminal-link";
import z from "zod";
import { getGitHubToken, loadEnvFile } from "./lib/env";
import {
	fixRepositoryReferences,
	type ReferenceFormat,
} from "./lib/references";
import { BoardExport, MapFormat } from "./lib/schemas";

// Load environment variables from .env file if present
loadEnvFile();

const program = new Command()
	.name("fix-references")
	.version("v0.1.0")
	.description(
		"Fix references between Trello cards in migrated GitHub issues and comments (replaces Trello card links with ticket references).",
	)
	.option(
		"--github-token <token>",
		"GitHub Personal Access Token (or GITHUB_TOKEN / GH_TOKEN / PAT in .env)",
	)
	.option(
		"-m, --map <file.toml>",
		"Path to map.toml file containing repo owner and repo name",
		"./map.toml",
	)
	.option(
		"--trello-export <file.json>",
		"Optional path to Trello export JSON file (for card ID / slug resolution)",
	)
	.option("--trello-url <url>", "Optional URL to Trello board")
	.option(
		"--reference-format <format>",
		"Format for issue references: id, url, or markdown (default: id)",
		"id",
	)
	.option("--issue <number>", "Only fix references in a specific issue number")
	.option(
		"--dry-run",
		"Preview what references will be fixed without making any changes",
	)
	.option("-y, --yes", "Skip confirmation prompt");

program.parse();
const opts = program.opts();

p.intro(`${chalk.bold.cyanBright("Fix Trello References")} v0.1.0`);

function onCancel() {
	p.cancel("Operation cancelled.");
	process.exit(0);
}

const mapPath = opts.map;
if (!existsSync(mapPath)) {
	p.cancel(`Map file not found at ${chalk.red(mapPath)}.`);
	process.exit(1);
}

let mapData: z.infer<typeof MapFormat>;
try {
	const mapVal = TOML.parse(await Bun.file(mapPath).text());
	const parsed = MapFormat.safeParse(mapVal);
	if (!parsed.success) {
		p.log.error(`Failed to parse map file (${mapPath}):`);
		p.log.error(z.prettifyError(parsed.error));
		process.exit(1);
	}
	mapData = parsed.data;
} catch (e) {
	p.log.error(`Failed to read map file: ${e}`);
	process.exit(1);
}

let ghToken = getGitHubToken(opts.githubToken);
if (!ghToken && !opts.dryRun) {
	ghToken = (await p.password({
		message: `Provide a ${chalk.underline.blue(terminalLink("Personal Access Token", "https://github.com/settings/tokens"))} with at least the \`${chalk.green("repo")}\` scope.`,
		validate: (val) => {
			if (!val) return "Please enter a token.";
		},
	})) as string;
	if (p.isCancel(ghToken)) onCancel();
}

if (!ghToken && opts.dryRun) {
	ghToken = "dry-run-token";
}

let trelloCards: z.infer<typeof BoardExport>["cards"] | undefined;

if (opts.trelloExport && existsSync(opts.trelloExport)) {
	try {
		const raw = await Bun.file(opts.trelloExport).json();
		const parsed = BoardExport.safeParse(raw);
		if (parsed.success) {
			trelloCards = parsed.data.cards;
			p.log.info(
				`Loaded ${chalk.blue(trelloCards.length)} cards from Trello export (${opts.trelloExport})`,
			);
		}
	} catch (e) {
		p.log.warn(`Could not load Trello export: ${e}`);
	}
}

const owner =
	typeof mapData.repo.owner === "string"
		? mapData.repo.owner
		: mapData.repo.owner.login;
const repo = mapData.repo.repo;
const format = (opts.referenceFormat as ReferenceFormat) || "id";
const targetIssueNumber = opts.issue ? Number(opts.issue) : undefined;

p.log.info(
	`Target repository: ${chalk.bold.green(`${owner}/${repo}`)}${targetIssueNumber ? ` (issue #${chalk.bold.yellow(targetIssueNumber)})` : ""}`,
);
p.log.info(
	`Reference format: ${chalk.cyan(format === "id" ? "#ticket-id" : format === "url" ? "ticket URL" : "[#ticket-id](ticket URL)")}`,
);

if (!opts.dryRun && !opts.yes) {
	const proceed = await p.confirm({
		message: `Fix Trello references in ${chalk.bold(`${owner}/${repo}`)}?`,
	});
	if (!proceed || p.isCancel(proceed)) {
		onCancel();
	}
}

const octokit = new Octokit({ auth: ghToken });
const spin = p.spinner({ indicator: "timer" });
spin.start(
	opts.dryRun
		? "[dry-run] Scanning for Trello card references..."
		: "Scanning and fixing Trello card references...",
);

try {
	const result = await fixRepositoryReferences({
		octokit,
		owner,
		repo,
		trelloCards,
		dryRun: opts.dryRun,
		format,
		targetIssueNumber,
		onLog: (msg) => {
			spin.message(msg);
		},
	});

	spin.stop("Scan completed.");

	p.note(
		`Scanned issues:   ${result.scannedIssues}\nUpdated issues:   ${result.updatedIssues}\nScanned comments: ${result.scannedComments}\nUpdated comments: ${result.updatedComments}\nTotal references: ${result.totalReplacements}`,
		"Summary",
	);

	if (opts.dryRun) {
		p.outro(
			`[dry-run] Finished preview. ${result.updatedIssues} issue(s) and ${result.updatedComments} comment(s) would be updated.`,
		);
	} else {
		p.outro(
			`Successfully updated ${result.updatedIssues} issue(s) and ${result.updatedComments} comment(s) (${result.totalReplacements} reference(s) fixed).`,
		);
	}
} catch (error) {
	spin.stop("Error occurred.");
	p.log.error(String(error));
	process.exit(1);
}
