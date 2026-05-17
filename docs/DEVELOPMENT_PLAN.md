# Skill Usage Manager Development Plan

## Summary

Develop a cross Claude Code / Codex Skills usage analytics and management plugin, temporarily named `skill-usage-manager`. Use a universal plugin package plus a local Tauri dashboard. Plugins register hooks, commands, and skills; the Tauri desktop app scans Skills, stores usage statistics, visualizes activity, and enables or disables Skills.

Default choices:

- Tech stack: Tauri 2, Rust, React, TypeScript, SQLite.
- Data directory: `~/.skill-usage-manager/`.
- Counting rule: for the same platform, session or turn, and skill, count at most once.
- Claude Code counting is high-confidence: `PreToolUse` with `matcher=Skill`, plus `UserPromptExpansion`.
- Codex counting is confidence-graded: explicit `$skill` or skill command signals plus `Stop` Hook transcript incremental parsing. Codex currently has no stable Skill-specific hook, so the UI must show `confirmed`, `inferred`, or `explicit-hint`.
- Skills management follows the `cc-switch` style: SQLite single source of truth, Tauri Commands -> Services -> DAO layering, atomic config writes, backups, unified Skills list, and app toggles.

## Architecture

Repository layout:

```text
skill-usage-manager/
  apps/desktop/                 # Tauri + React dashboard
  crates/core/                  # Rust core domain logic
  crates/hook-ingest/           # Small CLI: hook stdin -> SQLite or JSONL queue
  plugins/universal/            # Claude Code and Codex plugin package
    .claude-plugin/plugin.json
    .codex-plugin/plugin.json
    hooks/hooks.json
    skills/skill-usage-dashboard/SKILL.md
    commands/open-dashboard.md
    assets/
  tests/fixtures/               # Claude/Codex config, transcript, SKILL.md fixtures
```

Runtime:

- Claude Code installs the plugin and loads Claude hooks directly.
- Codex installs the plugin and requires `[features].plugin_hooks = true`; `skill-meter install --codex` must write or validate this setting and ask the user to restart Codex.
- Hooks must be non-blocking by default. They write usage events and must not interfere with the assistant flow.
- Only when the user enables strict blocking should Claude `PreToolUse` deny calls to disabled Skills.
- If the dashboard is closed, hooks still write queued JSONL events. The dashboard imports them on next launch.

## Key Interfaces And Data Model

SQLite tables:

- `skills`: `id, canonical_name, display_name, description, source_kind, first_seen_at, last_seen_at`
- `skill_locations`: `id, skill_id, platform, scope, skill_path, plugin_id, plugin_marketplace, enabled_state, enable_strategy, supports_exact_disable`
- `skill_usage_events`: `id, skill_id, platform, occurred_at, session_hash, turn_id, cwd_hash, invocation_kind, detector, confidence, raw_skill_name, hook_version`
- `skill_usage_daily`: `date, skill_id, platform, count, last_used_at`
- `hook_offsets`: `platform, transcript_path_hash, last_offset, last_seen_at`
- `audit_log`: enable/disable actions, config writes, rollback actions, hook installation actions
- `settings`: privacy, paths, hook status, Codex `plugin_hooks` health

Tauri/Rust commands:

- `scan_skills({ platforms, include_plugins, roots })`
- `get_skill_inventory({ platform, query, state })`
- `get_usage_summary({ range, platform, sort })`
- `get_skill_detail({ skill_id })`
- `set_skill_enabled({ location_id, state })`
- `bulk_set_skill_enabled({ location_ids, state })`
- `install_hooks({ platforms })`
- `check_hook_health()`
- `backfill_usage({ platforms, since })`
- `export_usage_csv({ range, platform })`
- `reset_usage({ skill_ids, before })`

CLI:

- `skill-meter open`
- `skill-meter hook ingest --platform claude|codex`
- `skill-meter install --claude --codex`
- `skill-meter doctor`
- `skill-meter scan`
- `skill-meter enable <skill> --platform codex`
- `skill-meter disable <skill> --platform claude --mode off`

Enable and disable strategy:

- Claude user or project Skills: write `skillOverrides`; map states to `on`, `name-only`, `user-invocable-only`, or `off`.
- Claude plugin Skills: prefer disabling the whole plugin. If the user requests single-skill disable, write a permission denial and have this plugin hook block `Skill(name)`.
- Codex Skills: write `~/.codex/config.toml` entries with `[[skills.config]] path = ".../SKILL.md" enabled = false`, and show that Codex restart may be required.
- Every config write must create a backup first, then use temp file, fsync, and atomic rename. Rollback must be available from the UI.

## Implementation Plan

1. Project skeleton

- Initialize Rust workspace, Tauri app, React/Vite, and SQLite migration framework.
- Create `core` crate for path resolution, frontmatter parsing, config editing, database models, and error types.
- Create `hook-ingest` CLI to read stdin JSON and write `~/.skill-usage-manager/events/*.jsonl`. Hook target runtime should be below 200 ms.

2. Skill scanning

- Claude scan roots: `~/.claude/skills`, project `.claude/skills`, and `~/.claude/plugins/cache/**/skills/*/SKILL.md`.
- Codex scan roots: repo-upward `.agents/skills`, `~/.agents/skills`, `/etc/codex/skills`, `~/.codex/plugins/cache/**/skills/*/SKILL.md`, and system Skills as read-only.
- Parse `SKILL.md` frontmatter: `name`, `description`, `disable-model-invocation`, and `user-invocable`.
- For Codex, also parse `agents/openai.yaml` where present, especially `allow_implicit_invocation`.
- Deduplicate with `canonical_name + source + path hash`. Same-name Skills across platforms should display as one Skill with multiple locations.

3. Usage statistics

- Claude `PreToolUse` with matcher `Skill`: read `tool_input.skill`.
- Claude `UserPromptExpansion`: read `command_name`, `command_args`, and `command_source`; cover direct `/skillname` calls.
- Codex `UserPromptSubmit`: record explicit `$skill` candidates, but do not count them as confirmed use yet.
- Codex `Stop`: incrementally parse transcript by `transcript_path + offset`, matching loaded `SKILL.md`, explicit mentions, and plugin skill read records.
- Store all Codex events with `confidence`; do not present inferred data as exact.
- Background importer deduplicates, merges, and updates rollups.
- Privacy default: store hashes for session, cwd, and transcript paths; never store prompt content.

4. Dashboard UI

- Overview: total calls, active Skills, 30/90-day unused Skills, platform share.
- Rankings: Top Used, Least Used, Never Used, with Claude/Codex filters.
- Inventory: table of all Skills with platform, source, enabled state, last call, total calls, confidence, and path.
- Skill detail drawer: trend, event list, locations, disable strategy, and open path action.
- Bulk actions: bulk off/name-only/on, CSV export, recalculate stats, rollback recent config changes.
- Diagnostics: hook health, Codex `plugin_hooks` status, latest ingest errors, and config backups.

5. Plugin packaging

- `plugins/universal/.claude-plugin/plugin.json`: declare Claude plugin metadata.
- `plugins/universal/.codex-plugin/plugin.json`: declare Codex plugin metadata, skills path, and interface metadata.
- `hooks/hooks.json`: support Claude and Codex environment differences. Claude examples may use `${CLAUDE_PLUGIN_ROOT}`; Codex examples may use `${PLUGIN_ROOT}`.
- Release artifact includes platform binary or installer script.
- `skill-meter doctor` verifies hook commands are executable and config files are writable.

## Test Plan

- Rust unit tests: frontmatter parsing, Codex TOML edits, Claude settings JSON edits, path normalization, event deduplication, rollups.
- Hook fixture tests: Claude `PreToolUse Skill`, Claude `/skill`, Codex `UserPromptSubmit`, Codex `Stop transcript`, malformed JSON, missing transcript.
- Integration tests: temporary HOME installs hooks, scans fake Skills, disables/enables Skills, validates config files and backups.
- Frontend tests: ranking sort, Never Used filter, bulk confirmation, confidence badges, rollback messaging.
- E2E: start Tauri app, import fixtures, verify charts are non-empty; use Playwright for desktop/mobile layout checks.
- Manual acceptance:
  - Claude `Skill(name)` increments count by one.
  - Claude direct `/skill args` increments count by one.
  - Codex explicit `$skill` is recorded and marked with confidence.
  - Disabling a Codex Skill writes `enabled = false` in `config.toml`.
  - Disabling a Claude user Skill writes `skillOverrides` with `off`.
  - Hook failure does not break normal Claude/Codex conversations.

## Assumptions And References

- This repository starts empty, so the work is a new project rather than an existing-codebase modification.
- The dashboard is a local Tauri desktop app, not a hosted web app.
- Codex currently lacks a stable Skill-specific Hook; Codex usage statistics must preserve confidence.
- `cc-switch` is the design reference for Tauri, SQLite, and Skills management structure.
- Reference docs to verify before implementation: Claude Plugins, Claude Hooks, Claude Skills, Codex Skills, Codex Hooks, Codex Plugin Build.

