# Architecture

## Decision

Use Tauri 2, React, TypeScript, Rust, and SQLite.

The project has four primary subsystems:

- `apps/desktop`: local desktop dashboard and controls.
- `crates/core`: shared Rust domain logic for scanning, parsing, config edits, data types, and database access.
- `crates/hook-ingest`: small CLI invoked by Claude Code and Codex hooks.
- `plugins/universal`: plugin package for Claude Code and Codex.

## Data Flow

1. Claude Code or Codex invokes a hook.
2. The hook pipes JSON to `skill-meter hook ingest --platform <platform>`.
3. The ingest CLI writes a compact event to `~/.skill-usage-manager/events/`.
4. The dashboard imports queued events into SQLite.
5. The dashboard scans Skills and joins usage events to inventory locations.
6. UI commands call Tauri commands, which delegate to Rust services and DAO code.

## Boundaries

- Hook code must be tiny, fast, and defensive.
- Core logic must not depend on React or Tauri UI code.
- UI must not edit Claude/Codex config files directly.
- Config edit services must own backup, atomic write, audit log, and rollback logic.

## Platform Notes

Claude Code:

- Plugin manifest lives at `.claude-plugin/plugin.json`.
- Hooks can capture `PreToolUse` for `Skill`.
- `UserPromptExpansion` covers direct skill command invocation.

Codex:

- Plugin manifest lives at `.codex-plugin/plugin.json`.
- Plugin hooks require `features.plugin_hooks = true`.
- Skill disabling is expressed through `[[skills.config]]` entries in `~/.codex/config.toml`.
- Usage detection must combine prompt signals and transcript parsing.

