# Trello to GitHub Import Tool

A CLI utility to import a Trello project into GitHub Issues and Projects.

## Features

- **Imports Trello Boards**: Transfer cards, lists, and board structure from Trello to GitHub.
- **User and Label Mapping**: Map Trello users and labels to GitHub equivalents via a TOML file.
- **Flexible Trello Input**: Import directly from a Trello export JSON file or a live board URL.
- **GitHub Auth**: Uses your GitHub personal access token for authentication.

![A screenshot of the tool in use](./.github/assets/screenshot.png)

## Installation

Make sure you have bun installed
see [installation docs](https://bun.com/docs/installation)

Then, clone this repository and install dependencies:

## Usage

> Note you must manually add the lists to the GitHub Project before running the import.

You can configure tokens via `.env` (copy `.env.example` to `.env`) or pass them via CLI flags or environment variables:

```bash
# Create .env from template
cp .env.example .env
# Fill in GITHUB_TOKEN=... in .env

# dry run
bun run index.ts --trello-export trello-data.json --map map.toml --dry-run

# actual run
bun run index.ts --trello-export trello-data.json --map map.toml
```

### Options

- `--github-token <token>`  
  Your GitHub Personal Access Token. **Required** for making changes on GitHub.

- `-m, --map <file.toml>`  
  Path to a TOML file mapping Trello users and labels to GitHub.

- `--dry-run`  
  Preview the migration, showing what would be transferred without making changes.

- `--exclude-column <columns...>` (or `--exclude-list <lists...>`)  
  Names or IDs of Trello columns/lists to exclude from the conversion. Cards in these columns will be skipped.

- `--keep-closed`  
  Also transfer cards that have been closed (archived) on Trello.

- `--no-fix-references` (or `--skip-fix-references`)  
  Disable automatically fixing cross-references between Trello cards after import.

- `--reference-format <format>`  
  Format for issue references: `id` (default: `#<issue-number>`), `url` (`https://github.com/.../issues/<number>`), or `markdown` (`[#<number>](...)`).

- `--fix-references-only`  
  Only scan and fix cross-references between cards on existing GitHub issues without importing new cards.

- `--trello-export <file.json>`  
  Path to a Trello export JSON file.  
  You can get this by downloading:  
  `https://trello.com/b/<board-id>.json`

- `--trello-url <url>`  
  The URL to your Trello board.  
  _Cannot be used together with `--trello-export`._

- `-h, --help`  
  Show help information.

- `-V, --version`  
  Show version information.

## Example

```bash
trello-to-github \
  --github-token YOUR_TOKEN_HERE \
  --trello-export board.json \
  --map mapping.toml \
  --dry-run
```

## Mapping File

The mapping file is a TOML file that lets you specify how Trello users and labels map to GitHub users and labels.

```toml
project = 3 # the GitHub Project number to import into

[repo]
# The GitHub username of the repo owner
owner = "Samk13"
# If the owner is an org, use:
# owner = { type = "organization", login = "piemot" }

# The name of the repository
repo = "gh-projects-migration-test"

[[users]]
trello = "samaa2"
github = "Samk13"

# Map Trello lists to GitHub Project statuses
[[lists]]
list = "USE CASE/USER STORIES->KRAV 🧩"
status = "USE CASE/USER STORIES->KRAV 🧩"
create = true

# Option A: Exclude a column directly in [[lists]]
[[lists]]
list = "Archive / Dump"
skip = true

# Option B: Exclude columns via [skip] table
[skip]
columns = ["Spam", "Drafts"]

[[labels]]
trello = "digital tjänst"
github = "digital tjänst"
create = true

```

## How to Get Your Trello Export

1. Go to your Trello board.
2. Visit: `https://trello.com/b/<board-id>.json`
3. Save the file locally and use it with `--trello-export`.

## Fixing Card References

When Trello cards contain links to other cards on the board, they are automatically replaced with GitHub issue references (`#<issue-number>` or issue URL) after the import completes.

The footer line `> Migrated from [Trello Card](...)` strictly retains the original Trello link.

### Standalone Command

You can also run the reference fixer standalone anytime on already-imported repositories:

```bash
# Using bun script
bun run fix-references --map map.toml --dry-run
bun run fix-references --map map.toml

# Or using the CLI binary
./fix-references.ts --map map.toml --trello-export trello.json

# Or using the subcommand
bun run index.ts fix-references --map map.toml
```

Options for standalone:
- `-m, --map <file.toml>`: Path to mapping file.
- `--trello-export <file.json>`: Optional Trello board export for additional card ID and slug resolution.
- `--reference-format <id|url|markdown>`: Format of references (`#<issue-number>`, ticket URL, or `[#<issue-number>](url)`). Default is `id`.
- `--issue <number>`: Limit to fixing references in a single issue.
- `--dry-run`: Preview changes without editing GitHub issues or comments.

## Notes

- You must have a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` permissions.
- Either `--trello-export` or `--trello-url` must be provided, but not both.

## Contributing

PRs welcome! Please open issues for feature requests or bug reports.

## License

MIT

---

_This project is not affiliated with Trello or GitHub._
