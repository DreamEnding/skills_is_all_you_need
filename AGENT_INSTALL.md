# Agent Install Guide

Give this file to an AI coding agent when you want it to install Skill Usage Manager on a machine.

## Copy-Paste Task For Agent

Install Skill Usage Manager from GitHub and verify that background Skill usage tracking works.

Repository:

```text
https://github.com/DreamEnding/skills_is_all_you_need
```

Do the following:

1. Check prerequisites:
   - `git`
   - `cargo`
   - optionally `claude`
   - optionally `codex`
2. Install the CLI:

   ```bash
   cargo install --git https://github.com/DreamEnding/skills_is_all_you_need --package skill-meter --locked
   ```

3. Verify the CLI:

   ```bash
   skill-meter --version
   skill-meter doctor
   ```

   Expected version: `skill-meter 1.0.0`.

4. If Claude Code is installed, install the plugin:

   ```bash
   claude plugin marketplace add DreamEnding/skills_is_all_you_need
   claude plugin install skill-usage-manager@skills-is-all-you-need
   claude plugin list
   ```

5. If Codex is installed, enable plugin hooks and add the marketplace:

   ```bash
   codex features enable plugin_hooks
   codex plugin marketplace add DreamEnding/skills_is_all_you_need
   codex plugin marketplace upgrade skills-is-all-you-need
   ```

6. Restart Claude Code and Codex after installing hooks.

7. Run a smoke test without touching the user's real usage database:

   macOS/Linux:

   ```bash
   TMP_HOME="$(mktemp -d)"
   export SKILL_USAGE_MANAGER_HOME="$TMP_HOME"
   printf '%s' '{"hook_event_name":"PreToolUse","session_id":"smoke","tool_name":"Skill","tool_input":{"skill":"smoke-test"}}' \
     | skill-meter hook ingest --platform claude
   skill-meter summary --format json
   skill-meter doctor
   ```

   Windows PowerShell:

   ```powershell
   $tmpHome = Join-Path $env:TEMP ("skill-meter-smoke-" + [guid]::NewGuid().ToString("N"))
   New-Item -ItemType Directory -Path $tmpHome | Out-Null
   $env:SKILL_USAGE_MANAGER_HOME = $tmpHome
   '{"hook_event_name":"PreToolUse","session_id":"smoke","tool_name":"Skill","tool_input":{"skill":"smoke-test"}}' |
     skill-meter hook ingest --platform claude
   skill-meter summary --format json
   skill-meter doctor
   ```

   Expected summary contains:

   ```json
   {
     "canonical_name": "smoke-test",
     "platform": "claude",
     "confidence": "confirmed",
     "count": 1
   }
   ```

8. Report:
   - CLI version
   - whether Claude plugin installation succeeded
   - whether Codex marketplace installation succeeded
   - smoke-test summary output
   - any missing prerequisites

## Notes For Agent

- Do not edit unrelated user configuration.
- Do not delete existing Claude Code or Codex plugins.
- If `cargo install` fails because Cargo's bin directory is not on `PATH`, add the Cargo bin directory to the user's shell profile or Windows user PATH, then re-open the shell.
- If Claude or Codex is not installed, install only the CLI and report that plugin installation was skipped.
- If a marketplace add command says the marketplace already exists, continue with install/update.
- The dashboard does not need to be running for usage counts to increase.
