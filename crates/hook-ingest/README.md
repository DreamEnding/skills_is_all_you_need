# Hook Ingest Crate

Rust CLI binary published as `skill-meter`.

Implemented commands:

- `skill-meter hook ingest --platform claude|codex [--strict]`
- `skill-meter import`
- `skill-meter summary [--format table|json]`
- `skill-meter scan`
- `skill-meter doctor`

Hook ingestion is fail-open by default: malformed payloads are recorded in SQLite ingest errors and the command exits successfully so Claude Code or Codex is not interrupted. Use `--strict` for tests and manual debugging.
