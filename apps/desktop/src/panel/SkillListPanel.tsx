import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Loader2,
  Filter,
  ChevronDown,
} from "lucide-react";
import type { SkillInventoryRow } from "../tauriClient";

interface SkillListPanelProps {
  skills: SkillInventoryRow[];
  toggling: boolean;
  onToggle: (locationId: number, currentState: string) => void;
  language: "en" | "zh";
}

function t(language: "en" | "zh", en: string, zh: string) {
  return language === "zh" ? zh : en;
}

type FilterState = "all" | "on" | "off";

const itemAnim = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
};

export function SkillListPanel({ skills, toggling, onToggle, language }: SkillListPanelProps) {
  const [filterState, setFilterState] = useState<FilterState>("all");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, SkillInventoryRow[]>();
    for (const skill of skills) {
      const existing = groups.get(skill.canonical_name) ?? [];
      existing.push(skill);
      groups.set(skill.canonical_name, existing);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, locations]) => {
        const isOn = locations.some((l) => l.enabled_state === "on");
        return { name, locations, isOn };
      });
  }, [skills]);

  const filteredGroups = useMemo(() => {
    if (filterState === "all") return groupedSkills;
    return groupedSkills.filter((g) =>
      filterState === "on" ? g.isOn : !g.isOn,
    );
  }, [groupedSkills, filterState]);

  async function handleToggle(locationId: number, currentState: string) {
    setTogglingId(locationId);
    await onToggle(locationId, currentState);
    setTogglingId(null);
  }

  const filterCounts = useMemo(() => ({
    all: groupedSkills.length,
    on: groupedSkills.filter((g) => g.isOn).length,
    off: groupedSkills.filter((g) => !g.isOn).length,
  }), [groupedSkills]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
          {(["all", "on", "off"] as FilterState[]).map((state) => (
            <button
              key={state}
              onClick={() => setFilterState(state)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filterState === state
                  ? "bg-[hsl(var(--primary))] text-white shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {t(
                language,
                `${state === "all" ? "All" : state === "on" ? "Enabled" : "Disabled"} (${filterCounts[state]})`,
                `${state === "all" ? "全部" : state === "on" ? "已启用" : "已禁用"} (${filterCounts[state]})`,
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Skill cards */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        className="grid grid-cols-1 gap-3 lg:grid-cols-2"
      >
        {filteredGroups.length === 0 ? (
          <div className="col-span-2 flex h-48 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            {t(language, "No skills match the current filter", "没有匹配当前筛选的技能")}
          </div>
        ) : (
          filteredGroups.map(({ name, locations, isOn }) => (
            <motion.div
              key={name}
              variants={itemAnim}
              layout
              className={`glass-card p-4 transition-all ${isOn ? "" : "opacity-70"}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                      {name}
                    </h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isOn
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-red-500/10 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {isOn
                        ? t(language, "ON", "启用")
                        : t(language, "OFF", "禁用")}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {locations.map((loc) => (
                      <span
                        key={loc.location_id}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          loc.platform === "claude"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {loc.platform}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Master toggle if only one location */}
                {locations.length === 1 && (
                  <ToggleSwitch
                    enabled={locations[0].enabled_state === "on"}
                    loading={togglingId === locations[0].location_id}
                    onToggle={() =>
                      handleToggle(locations[0].location_id, locations[0].enabled_state)
                    }
                  />
                )}
              </div>

              {/* Expandable details for multi-location */}
              {locations.length > 1 && (
                <div className="mt-3">
                  <button
                    onClick={() => setExpandedSkill(expandedSkill === name ? null : name)}
                    className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${expandedSkill === name ? "rotate-180" : ""}`}
                    />
                    {locations.length} {t(language, "locations", "位置")}
                  </button>

                  <AnimatePresence>
                    {expandedSkill === name && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 space-y-2">
                          {locations.map((loc) => (
                            <div
                              key={loc.location_id}
                              className="flex items-center justify-between rounded-lg bg-[hsl(var(--muted))] px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                      loc.platform === "claude"
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    }`}
                                  >
                                    {loc.platform}
                                  </span>
                                  <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                                    {loc.skill_path.split(/[/\\]/).slice(-2).join("/")}
                                  </span>
                                </div>
                              </div>
                              <ToggleSwitch
                                enabled={loc.enabled_state === "on"}
                                loading={togglingId === loc.location_id}
                                onToggle={() => handleToggle(loc.location_id, loc.enabled_state)}
                              />
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  );
}

function ToggleSwitch({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
        enabled
          ? "bg-emerald-500"
          : "bg-[hsl(var(--muted-foreground))]/30"
      } ${loading ? "opacity-60" : ""}`}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={10} className="animate-spin text-white" />
        </div>
      ) : (
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      )}
    </button>
  );
}
