# Agent Handoff

Read this first.

## Required Reading Order

1. `docs/DEVELOPMENT_PLAN.md`
2. `docs/ARCHITECTURE.md`
3. `docs/RESEARCH_NOTES.md`
4. Plugin placeholders under `plugins/universal/`

## Critical Constraints

- Do not assume Claude Code and Codex have identical hook semantics.
- Re-check current official Claude Code and Codex docs before implementing hooks or plugin manifests.
- Codex usage statistics are not fully deterministic with the current hook surface. Preserve a `confidence` field and show it in the UI.
- Never write to Claude or Codex config files without creating a backup first.
- All config writes must be atomic or rollbackable.
- Build ingestion and persistence before the dashboard UI.
- Do not store prompt content by default. Use hashes for session, cwd, and transcript path identity.

## Recommended Implementation Order

1. Implement the `hook-ingest` CLI and event queue. Done for MVP.
2. Implement SQLite schema and migrations. Done for MVP.
3. Implement Skill scanning and canonicalization. Partially done.
4. Implement Claude usage detection. Done for MVP.
5. Implement Codex usage detection with confidence levels. Done for explicit hints; transcript inference remains future work.
6. Implement Tauri commands. Done for scan, import, and summary.
7. Implement dashboard UI. Done for MVP summary and inventory.
8. Implement enable/disable config editing and rollback.
9. Package Claude/Codex plugins.
10. Add docs, fixtures, tests, and release checks.

## Definition Of Done

- Claude Code usage events are counted from both model Skill tool calls and direct slash skill invocations.
- Codex usage events are recorded with confidence labels.
- The dashboard can identify most-used, least-used, and never-used Skills.
- The user can enable or disable Skills for Claude Code and Codex from the UI.
- Config changes are backed up and auditable.
- Hook failure cannot break normal assistant use.
