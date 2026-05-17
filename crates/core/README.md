# Core Crate

Shared Rust domain logic for Skill Usage Manager.

Current responsibilities:

- Resolve the local data directory, with `SKILL_USAGE_MANAGER_HOME` test override.
- Parse `SKILL.md` frontmatter and scan Claude/Codex Skill roots.
- Normalize hook payloads into privacy-preserving usage events.
- Own SQLite migrations, usage event import, deduplication, daily rollups, and summary queries.

Planned responsibilities:

- Config editing for Claude/Codex Skill enablement with backup, audit, atomic write, and rollback.
- More complete Codex transcript inference once the hook surface is stable enough.
