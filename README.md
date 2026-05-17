# Skill Usage Manager

Local plugin, CLI, and dashboard skeleton for tracking Skills usage across Claude Code and Codex.

Current MVP status:

- `skill-meter hook ingest --platform claude|codex` reads a hook payload from stdin and appends a compact event to a local JSONL queue.
- `skill-meter import` imports queued events into SQLite and updates daily rollups.
- `skill-meter summary --format table|json` prints usage totals grouped by Skill, platform, and confidence.
- `skill-meter scan` scans local Claude and Codex Skill roots.
- The Tauri dashboard can import queued events, show usage summary metrics, and scan local Skills. Enable/disable controls are still future work.

Data defaults to `~/.skill-usage-manager/`. Tests and local experiments can override this with `SKILL_USAGE_MANAGER_HOME`.

Useful commands:

```bash
cargo test
cargo run --bin skill-meter -- doctor
cargo run --bin skill-meter -- scan
cargo run --bin skill-meter -- import
cargo run --bin skill-meter -- summary --format json
pnpm --dir apps/desktop build
pnpm --dir apps/desktop dev
```

Design docs:

- `docs/AGENT_HANDOFF.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/RESEARCH_NOTES.md`
