# Desktop App

Tauri 2 + React dashboard skeleton.

Current behavior:

- Calls the Tauri `scan_skills` command.
- Imports queued JSONL usage events through `import_usage_events`.
- Loads usage totals through `get_usage_summary`.
- Displays usage metrics, confidence labels, scanned Skill names, platforms, and location counts.

Future responsibilities:

- Show richer rankings, detail drawers, and diagnostics.
- Call Tauri commands for enable/disable operations and rollback.
- Never edit Claude Code or Codex configuration files directly.
