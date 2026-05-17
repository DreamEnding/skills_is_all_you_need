use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: Option<i64>,
    pub canonical_name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub source_kind: String,
    pub first_seen_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillLocation {
    pub id: Option<i64>,
    pub skill_id: i64,
    pub platform: Platform,
    pub scope: String,
    pub skill_path: String,
    pub plugin_id: Option<String>,
    pub enabled_state: EnabledState,
    pub enable_strategy: EnableStrategy,
    pub supports_exact_disable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Claude,
    Codex,
}

impl Platform {
    pub fn as_str(&self) -> &'static str {
        match self {
            Platform::Claude => "claude",
            Platform::Codex => "codex",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "claude" => Some(Platform::Claude),
            "codex" => Some(Platform::Codex),
            _ => None,
        }
    }
}

impl FromStr for Platform {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        Self::parse(s).ok_or_else(|| format!("unknown platform: {s}"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EnabledState {
    On,
    NameOnly,
    UserInvocableOnly,
    Off,
}

impl EnabledState {
    pub fn as_str(&self) -> &'static str {
        match self {
            EnabledState::On => "on",
            EnabledState::NameOnly => "name-only",
            EnabledState::UserInvocableOnly => "user-invocable-only",
            EnabledState::Off => "off",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EnableStrategy {
    SkillOverride,
    PluginDisable,
    PermissionDeny,
    CodexConfig,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    Confirmed,
    Inferred,
    ExplicitHint,
}

impl Confidence {
    pub fn as_str(&self) -> &'static str {
        match self {
            Confidence::Confirmed => "confirmed",
            Confidence::Inferred => "inferred",
            Confidence::ExplicitHint => "explicit-hint",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InvocationKind {
    ModelToolCall,
    SlashCommand,
    Implicit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEvent {
    pub platform: Platform,
    pub occurred_at: DateTime<Utc>,
    pub session_hash: String,
    pub turn_id: Option<String>,
    pub cwd_hash: Option<String>,
    pub invocation_kind: InvocationKind,
    pub detector: String,
    pub confidence: Confidence,
    pub raw_skill_name: String,
    pub hook_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageDaily {
    pub date: String,
    pub skill_id: i64,
    pub platform: Platform,
    pub count: i64,
    pub last_used_at: DateTime<Utc>,
}
