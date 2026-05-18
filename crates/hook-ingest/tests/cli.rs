use assert_cmd::Command;

#[test]
fn hook_ingest_defaults_to_fail_open_on_bad_payload() {
    let temp = tempfile::tempdir().expect("temp dir");

    let mut cmd = Command::cargo_bin("skill-meter").expect("binary");
    cmd.env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .args(["hook", "ingest", "--platform", "claude"])
        .write_stdin("{not json");

    cmd.assert().success();

    let mut doctor = Command::cargo_bin("skill-meter").expect("binary");
    let output = doctor
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .arg("doctor")
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output = String::from_utf8(output).expect("utf8");

    assert!(output.contains("ingest errors: 1"));
}

#[test]
fn hook_import_and_summary_provide_cli_acceptance_path() {
    let temp = tempfile::tempdir().expect("temp dir");
    let raw = r#"{
        "hook_event_name": "PreToolUse",
        "session_id": "session-1",
        "tool_name": "Skill",
        "tool_input": { "skill": "brainstorming" }
    }"#;

    let mut ingest = Command::cargo_bin("skill-meter").expect("binary");
    ingest
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .args(["hook", "ingest", "--platform", "claude"])
        .write_stdin(raw)
        .assert()
        .success();

    let mut import = Command::cargo_bin("skill-meter").expect("binary");
    import
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .arg("import")
        .assert()
        .success();

    let mut summary = Command::cargo_bin("skill-meter").expect("binary");
    let stdout = summary
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .args(["summary", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let rows: serde_json::Value = serde_json::from_slice(&stdout).expect("json");

    assert_eq!(rows[0]["canonical_name"], "brainstorming");
    assert_eq!(rows[0]["platform"], "claude");
    assert_eq!(rows[0]["confidence"], "confirmed");
    assert_eq!(rows[0]["count"], 1);
}

#[test]
fn hook_ingest_updates_summary_without_separate_import() {
    let temp = tempfile::tempdir().expect("temp dir");
    let raw = r#"{
        "hook_event_name": "UserPromptExpansion",
        "session_id": "session-2",
        "command_name": "/research-lit",
        "prompt": "/research-lit transformers"
    }"#;

    let mut ingest = Command::cargo_bin("skill-meter").expect("binary");
    ingest
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .args(["hook", "ingest", "--platform", "claude"])
        .write_stdin(raw)
        .assert()
        .success();

    let mut summary = Command::cargo_bin("skill-meter").expect("binary");
    let stdout = summary
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .args(["summary", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let rows: serde_json::Value = serde_json::from_slice(&stdout).expect("json");

    assert_eq!(rows[0]["canonical_name"], "research-lit");
    assert_eq!(rows[0]["platform"], "claude");
    assert_eq!(rows[0]["confidence"], "confirmed");
    assert_eq!(rows[0]["count"], 1);
}

#[test]
fn repeated_hook_ingests_for_same_skill_are_counted_separately() {
    let temp = tempfile::tempdir().expect("temp dir");
    let raw = r#"{
        "hook_event_name": "PreToolUse",
        "session_id": "session-3",
        "tool_name": "Skill",
        "tool_input": { "skill_name": "test-driven-development" }
    }"#;

    for _ in 0..2 {
        let mut ingest = Command::cargo_bin("skill-meter").expect("binary");
        ingest
            .env("SKILL_USAGE_MANAGER_HOME", temp.path())
            .args(["hook", "ingest", "--platform", "claude"])
            .write_stdin(raw)
            .assert()
            .success();
    }

    let mut summary = Command::cargo_bin("skill-meter").expect("binary");
    let stdout = summary
        .env("SKILL_USAGE_MANAGER_HOME", temp.path())
        .args(["summary", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let rows: serde_json::Value = serde_json::from_slice(&stdout).expect("json");

    assert_eq!(rows[0]["canonical_name"], "test-driven-development");
    assert_eq!(rows[0]["count"], 2);
}

#[test]
fn scan_supports_json_output_for_dev_preview() {
    let mut scan = Command::cargo_bin("skill-meter").expect("binary");
    let stdout = scan
        .args(["scan", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let rows: serde_json::Value = serde_json::from_slice(&stdout).expect("json");

    assert!(rows.is_array());
    if let Some(first) = rows.as_array().and_then(|items| items.first()) {
        assert!(first.get("canonical_name").is_some());
        assert!(first.get("locations").is_some());
    }
}
