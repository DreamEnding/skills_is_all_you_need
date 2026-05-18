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

export interface SkillInventoryRow {
  location_id: number;
  canonical_name: string;
  platform: string;
  scope: string;
  skill_path: string;
  enabled_state: string;
  enable_strategy: string;
  supports_exact_disable: boolean;
}

export interface ToggleResultInfo {
  location_id: number;
  new_state: string;
  backup_path: string | null;
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

const previewInventory: SkillInventoryRow[] = [
  {
    location_id: 1,
    canonical_name: "brainstorming",
    platform: "claude",
    scope: "user",
    skill_path: "~/.claude/skills/brainstorming/SKILL.md",
    enabled_state: "on",
    enable_strategy: "skill-override",
    supports_exact_disable: true,
  },
  {
    location_id: 2,
    canonical_name: "smart-search",
    platform: "codex",
    scope: "user",
    skill_path: "~/.agents/skills/smart-search/SKILL.md",
    enabled_state: "on",
    enable_strategy: "codex-config",
    supports_exact_disable: true,
  },
  {
    location_id: 3,
    canonical_name: "test-driven-development",
    platform: "claude",
    scope: "user",
    skill_path: "~/.claude/skills/test-driven-development/SKILL.md",
    enabled_state: "on",
    enable_strategy: "skill-override",
    supports_exact_disable: true,
  },
  {
    location_id: 4,
    canonical_name: "test-driven-development",
    platform: "codex",
    scope: "user",
    skill_path: "~/.agents/skills/test-driven-development/SKILL.md",
    enabled_state: "off",
    enable_strategy: "codex-config",
    supports_exact_disable: true,
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
    return scanSkillsFromDevServer();
  }
  return invoke<SkillInfo[]>("scan_skills");
}

export async function getSkillInventory(): Promise<SkillInventoryRow[]> {
  if (!isTauriRuntime()) {
    return previewInventory;
  }
  return invoke<SkillInventoryRow[]>("get_skill_inventory");
}

export async function setSkillEnabled(
  locationId: number,
  newState: string,
): Promise<ToggleResultInfo> {
  return invoke<ToggleResultInfo>("set_skill_enabled", {
    locationId,
    newState,
    dryRun: false,
  });
}

export async function bulkSetSkillEnabled(
  locationIds: number[],
  newState: string,
): Promise<ToggleResultInfo[]> {
  return invoke<ToggleResultInfo[]>("bulk_set_skill_enabled", {
    locationIds,
    newState,
    dryRun: false,
  });
}

async function scanSkillsFromDevServer(): Promise<SkillInfo[]> {
  try {
    const response = await fetch("/api/scan-skills");
    if (!response.ok) {
      return previewSkills;
    }
    return (await response.json()) as SkillInfo[];
  } catch {
    return previewSkills;
  }
}
