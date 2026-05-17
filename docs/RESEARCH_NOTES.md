# Research Notes

These notes summarize the facts discovered before creating this skeleton. Re-verify them against current official docs before coding.

## Claude Code

- Claude Code plugins use `.claude-plugin/plugin.json`.
- Claude Code plugins may include `skills/`, `hooks/`, commands, and other plugin resources.
- Hooks support `PreToolUse`; using matcher `Skill` can observe model Skill invocations.
- Hooks support `UserPromptExpansion`; this can observe direct slash-style skill invocation.
- User/project Skill enablement can be controlled with Skill override-style settings.
- Plugin-provided Skills may require plugin-level management or hook-based blocking when exact per-Skill disable is unavailable.

## Codex

- Codex plugins use `.codex-plugin/plugin.json`.
- Codex plugin manifests can declare `skills`, `hooks`, `mcpServers`, `apps`, and `interface` metadata.
- Codex plugin hooks require a config feature gate: `features.plugin_hooks = true`.
- Codex Skills can be explicitly or implicitly invoked, depending on metadata and matching.
- Codex Skill disabling uses `~/.codex/config.toml` with `[[skills.config]] path = ".../SKILL.md" enabled = false`.
- Codex does not currently expose a stable Skill-specific hook event equivalent to Claude's `PreToolUse matcher=Skill`, so usage statistics must keep confidence metadata.

## cc-switch Reference

`cc-switch` is the architecture reference for:

- Tauri 2 + React + TypeScript + Rust.
- SQLite as single source of truth.
- Commands -> Services -> DAO layering.
- Atomic config writes and backups.
- Unified Skills panel across multiple AI coding tools.
- App toggles and per-platform sync behavior.

