import { motion } from "framer-motion";
import {
  BarChart3,
  Package,
  Activity,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { UsageSummaryInfo, SkillInventoryRow } from "../tauriClient";

interface OverviewPanelProps {
  summary: UsageSummaryInfo[];
  skills: SkillInventoryRow[];
  language: "en" | "zh";
}

function t(language: "en" | "zh", en: string, zh: string) {
  return language === "zh" ? zh : en;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

export function OverviewPanel({ summary, skills, language }: OverviewPanelProps) {
  const totalCalls = summary.reduce((sum, r) => sum + r.count, 0);
  const confirmedCalls = summary
    .filter((r) => r.confidence === "confirmed")
    .reduce((sum, r) => sum + r.count, 0);
  const confidencePct = totalCalls === 0 ? 0 : Math.round((confirmedCalls / totalCalls) * 100);
  const enabledCount = skills.filter((s) => s.enabled_state === "on").length;
  const disabledCount = skills.length - enabledCount;

  const topSkills = (() => {
    const counts = new Map<string, number>();
    for (const row of summary) {
      counts.set(row.canonical_name, (counts.get(row.canonical_name) ?? 0) + row.count);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  const platformShare = (() => {
    const counts = { claude: 0, codex: 0 };
    for (const row of summary) {
      if (row.platform === "claude" || row.platform === "codex") {
        counts[row.platform] += row.count;
      }
    }
    return counts;
  })();

  const metrics = [
    {
      label: t(language, "Total Calls", "总调用"),
      value: totalCalls.toLocaleString(),
      icon: BarChart3,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: t(language, "Skills", "技能数"),
      value: skills.length.toLocaleString(),
      icon: Package,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      label: t(language, "Enabled", "已启用"),
      value: `${enabledCount}`,
      icon: Activity,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: t(language, "Confidence", "可信度"),
      value: `${confidencePct}%`,
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <motion.div
              key={m.label}
              variants={item}
              className="glass-card p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {m.label}
                </span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.bg}`}>
                  <Icon size={14} className={m.color} />
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold text-[hsl(var(--foreground))]">{m.value}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top Skills */}
        <motion.div variants={item} className="glass-card col-span-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {t(language, "Top Skills", "高频技能")}
            </h3>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {topSkills.length} {t(language, "ranked", "排行")}
            </span>
          </div>
          <div className="space-y-3">
            {topSkills.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
                {t(language, "No usage data yet", "暂无用量数据")}
              </div>
            ) : (
              topSkills.map((skill) => {
                const max = topSkills[0]?.count ?? 1;
                const width = Math.max(8, Math.round((skill.count / max) * 100));
                return (
                  <div key={skill.name} className="group">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-[hsl(var(--foreground))]">
                        {skill.name}
                      </span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">
                        {skill.count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${width}%` }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                        className="h-full rounded-full bg-[hsl(var(--primary))]"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Platform share */}
        <motion.div variants={item} className="glass-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
            {t(language, "Platform Share", "平台占比")}
          </h3>
          <div className="space-y-4">
            {(["claude", "codex"] as const).map((platform) => {
              const count = platformShare[platform];
              const pct = totalCalls === 0 ? 0 : Math.round((count / totalCalls) * 100);
              return (
                <div key={platform}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-[hsl(var(--foreground))]">
                      {platform}
                    </span>
                    <span className="font-semibold text-[hsl(var(--foreground))]">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                      className={`h-full rounded-full ${
                        platform === "claude" ? "bg-blue-500" : "bg-amber-500"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-lg bg-[hsl(var(--muted))] p-3">
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <TrendingUp size={12} />
              {t(language, `${disabledCount} disabled`, `${disabledCount} 已禁用`)}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
