# Skill Usage Manager

Track which Skills your local agents actually use.

Skill Usage Manager records Claude Code and Codex Skill invocations in a local SQLite database, then shows usage and inventory in a desktop dashboard. It is built for people who have many Skills installed and want to know which ones are active, stale, duplicated, or never used.

## What It Does

- Counts Claude Code Skill calls in the background.
- Counts Codex Skill usage signals in the background.
- Scans local Claude Code and Codex Skill folders.
- Shows a bilingual dashboard for usage summary and Skill inventory.
- Keeps data local by default.
- Works without keeping the dashboard open.

## Quick Start

Install the CLI:

```bash
cargo install --git https://github.com/DreamEnding/skills_is_all_you_need --package skill-meter --locked
```

Check that it is available:

```bash
skill-meter --version
skill-meter doctor
```

Install the Claude Code plugin:

```bash
claude plugin marketplace add DreamEnding/skills_is_all_you_need
claude plugin install skill-usage-manager@skills-is-all-you-need
```

Install the Codex plugin marketplace:

```bash
codex features enable plugin_hooks
codex plugin marketplace add DreamEnding/skills_is_all_you_need
```

Restart Claude Code or Codex after installing hooks. New Skill calls will be recorded automatically.

## Daily Use

Show usage totals:

```bash
skill-meter summary
skill-meter summary --format json
```

Scan installed Skills:

```bash
skill-meter scan
skill-meter scan --format json
```

Check hook/database health:

```bash
skill-meter doctor
```

Run the desktop dashboard from a cloned repo:

```bash
git clone https://github.com/DreamEnding/skills_is_all_you_need.git
cd skills_is_all_you_need
pnpm --dir apps/desktop install
pnpm --dir apps/desktop dev
```

## What Gets Counted

| Platform | Signal | Confidence |
| --- | --- | --- |
| Claude Code | `PreToolUse` for the `Skill` tool | `confirmed` |
| Claude Code | direct `/skill` invocation | `confirmed` |
| Codex | prompt mentions like `$research-lit` | `explicit-hint` |
| Codex | transcript reads of `*/SKILL.md` | `inferred` |

Claude Code has a direct Skill hook, so its counts are high confidence. Codex does not currently expose an equivalent stable Skill-specific hook, so Codex events are confidence-labeled.

## Data Location

By default, all data is stored locally:

```text
~/.skill-usage-manager/
  usage.db
  events/*.jsonl
```

Override the data directory when testing:

```bash
SKILL_USAGE_MANAGER_HOME=/tmp/skill-meter-dev skill-meter summary
```

PowerShell:

```powershell
$env:SKILL_USAGE_MANAGER_HOME="D:\tmp\skill-meter-dev"
skill-meter summary
```

## Privacy

- No telemetry is sent by this project.
- Events are written to local SQLite and JSONL files.
- Session identifiers are hashed.
- Codex transcript parsing extracts Skill names from `SKILL.md` paths; it does not store transcript text.

## Agent Install

If you want another AI coding agent to install this repo for you, give it [AGENT_INSTALL.md](AGENT_INSTALL.md). It contains a copy-pasteable installation task with verification steps.

## Troubleshooting

### `skill-meter` is not found

Make sure Cargo's binary directory is on `PATH`:

```bash
echo $PATH
```

Common locations:

- macOS/Linux: `~/.cargo/bin`
- Windows: `%USERPROFILE%\.cargo\bin`

### Counts do not increase

Run:

```bash
skill-meter doctor
```

Then check:

- `skill-meter` is on `PATH`.
- the plugin is installed and enabled.
- Claude Code or Codex was restarted after hook installation.
- `ingest errors` is `0`.

### Codex only shows `explicit-hint`

Codex inferred usage depends on `Stop` hook transcript access. If a Codex build does not provide `transcript_path`, only explicit `$skill` prompt hints can be counted.

## Development

Clone and verify:

```bash
git clone https://github.com/DreamEnding/skills_is_all_you_need.git
cd skills_is_all_you_need
cargo test
cargo clippy --all-targets --all-features -- -D warnings
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

## Tech Stack

- Rust CLI and core library
- SQLite via `rusqlite`
- Tauri 2 desktop shell
- React + TypeScript + Vite dashboard
- Claude Code and Codex plugin hooks

## Status

Version: `1.0.0`

Implemented:

- background hook ingest
- local usage database
- Claude and Codex usage signals
- Skill inventory scan
- bilingual dashboard
- public plugin marketplace metadata

Still planned:

- enable/disable Skill management from the dashboard
- packaged desktop installers
- deeper Codex confirmed-use detection if a stable Skill hook becomes available
