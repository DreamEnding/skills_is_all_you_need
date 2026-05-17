import { invoke } from "@tauri-apps/api/core";

export interface SkillInfo {
  canonical_name: string;
  locations: { platform: string; skill_path: string }[];
}

export interface UsageSummaryInfo {
  canonical_name: string;
  platform: string;
  confidence: string;
  count: number;
}

const previewSummary: UsageSummaryInfo[] = [
  {
    canonical_name: "brainstorming",
    platform: "claude",
    confidence: "confirmed",
    count: 18,
  },
  {
    canonical_name: "research-lit",
    platform: "claude",
    confidence: "confirmed",
    count: 11,
  },
  {
    canonical_name: "smart-search",
    platform: "codex",
    confidence: "explicit-hint",
    count: 7,
  },
  {
    canonical_name: "test-driven-development",
    platform: "codex",
    confidence: "inferred",
    count: 4,
  },
];

const previewSkills: SkillInfo[] = [
  {
    canonical_name: "brainstorming",
    locations: [{ platform: "claude", skill_path: "~/.claude/skills/brainstorming/SKILL.md" }],
  },
  {
    canonical_name: "smart-search",
    locations: [{ platform: "codex", skill_path: "~/.agents/skills/smart-search/SKILL.md" }],
  },
  {
    canonical_name: "test-driven-development",
    locations: [
      { platform: "claude", skill_path: "~/.claude/skills/test-driven-development/SKILL.md" },
      { platform: "codex", skill_path: "~/.agents/skills/test-driven-development/SKILL.md" },
    ],
  },
];

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getUsageSummary(): Promise<UsageSummaryInfo[]> {
  if (!isTauriRuntime()) {
    return previewSummary;
  }
  return invoke<UsageSummaryInfo[]>("get_usage_summary");
}

export async function importUsageEvents(): Promise<number> {
  if (!isTauriRuntime()) {
    return 0;
  }
  return invoke<number>("import_usage_events");
}

export async function scanSkills(): Promise<SkillInfo[]> {
  if (!isTauriRuntime()) {
    return previewSkills;
  }
  return invoke<SkillInfo[]>("scan_skills");
}
