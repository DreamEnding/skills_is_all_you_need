# Skill Usage Manager Universal Plugin

This package is shared by Claude Code and Codex.

## Claude Code

Claude Code loads `hooks/hooks.json`.

Captured events:

- `PreToolUse` with `matcher: Skill`
- `UserPromptExpansion`

Both invoke:

```bash
skill-meter hook ingest --platform claude
```

## Codex

Codex loads `hooks/codex-hooks.json` through `.codex-plugin/plugin.json`.

Captured events:

- `UserPromptSubmit`
- `Stop`

Both invoke:

```bash
skill-meter hook ingest --platform codex
```

`UserPromptSubmit` records explicit `$skill` mentions. `Stop` reads the transcript path from the hook payload and records inferred Skill use when Codex has read a `SKILL.md` file.

## Runtime requirement

`skill-meter` must be available on `PATH` for background hooks. The dashboard does not need to be running for counts to be recorded.
