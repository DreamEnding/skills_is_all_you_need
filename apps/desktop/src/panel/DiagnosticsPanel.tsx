import { motion } from "framer-motion";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
} from "lucide-react";
import type { UsageSummaryInfo, SkillInventoryRow } from "../tauriClient";

interface DiagnosticsPanelProps {
  skills: SkillInventoryRow[];
  summary: UsageSummaryInfo[];
  language: "en" | "zh";
  onRefresh: () => void;
}

function t(language: "en" | "zh", en: string, zh: string) {
  return language === "zh" ? zh : en;
}

const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
};

export function DiagnosticsPanel({ skills, summary, language, onRefresh }: DiagnosticsPanelProps) {
  const enabledCount = skills.filter((s) => s.enabled_state === "on").length;
  const disabledCount = skills.length - enabledCount;
  const totalCalls = summary.reduce((sum, r) => sum + r.count, 0);
  const confirmedCalls = summary.filter((r) => r.confidence === "confirmed").reduce((s, r) => s + r.count, 0);
  const inferredCalls = summary.filter((r) => r.confidence === "inferred").reduce((s, r) => s + r.count, 0);
  const explicitCalls = summary.filter((r) => r.confidence === "explicit-hint").reduce((s, r) => s + r.count, 0);

  const checks = [
    {
      label: t(language, "Database Connection", "数据库连接"),
      status: "ok" as const,
      detail: t(language, "SQLite database operational", "SQLite 数据库正常运行"),
    },
    {
      label: t(language, "Hook Pipeline", "钩子管道"),
      status: totalCalls > 0 ? ("ok" as const) : ("warn" as const),
      detail: totalCalls > 0
        ? t(language, `${totalCalls} events recorded`, `已记录 ${totalCalls} 个事件`)
        : t(language, "No events recorded yet", "尚未记录事件"),
    },
    {
      label: t(language, "Skills Scan", "技能扫描"),
      status: skills.length > 0 ? ("ok" as const) : ("warn" as const),
      detail: t(language, `${skills.length} skills found`, `发现 ${skills.length} 个技能`),
    },
    {
      label: t(language, "Confidence Levels", "可信度分布"),
      status: "ok" as const,
      detail: t(
        language,
        `Confirmed: ${confirmedCalls}, Inferred: ${inferredCalls}, Explicit: ${explicitCalls}`,
        `已确认: ${confirmedCalls}, 推断: ${inferredCalls}, 显式: ${explicitCalls}`,
      ),
    },
  ];

  function StatusIcon({ status }: { status: "ok" | "warn" | "error" }) {
    switch (status) {
      case "ok":
        return <CheckCircle2 size={16} className="text-emerald-500" />;
      case "warn":
        return <AlertTriangle size={16} className="text-amber-500" />;
      case "error":
        return <XCircle size={16} className="text-red-500" />;
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="space-y-6"
    >
      {/* Health overview */}
      <motion.div variants={itemAnim} className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[hsl(var(--primary))]" />
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {t(language, "System Health", "系统健康")}
            </h3>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
          >
            <RefreshCw size={12} />
            {t(language, "Refresh", "刷新")}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-start gap-3 rounded-lg bg-[hsl(var(--muted))] p-3"
            >
              <StatusIcon status={check.status} />
              <div>
                <div className="text-xs font-semibold text-[hsl(var(--foreground))]">
                  {check.label}
                </div>
                <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {check.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Skill state summary */}
      <motion.div variants={itemAnim} className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity size={16} className="text-[hsl(var(--primary))]" />
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t(language, "Skill State Summary", "技能状态摘要")}
          </h3>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">
                {t(language, "Enabled", "已启用")}
              </span>
              <span className="font-semibold text-emerald-500">{enabledCount}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: skills.length === 0 ? "0%" : `${(enabledCount / skills.length) * 100}%`,
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-emerald-500"
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">
                {t(language, "Disabled", "已禁用")}
              </span>
              <span className="font-semibold text-red-500">{disabledCount}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: skills.length === 0 ? "0%" : `${(disabledCount / skills.length) * 100}%`,
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                className="h-full rounded-full bg-red-500"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Platform breakdown */}
      <motion.div variants={itemAnim} className="glass-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
          {t(language, "Platform Breakdown", "平台分布")}
        </h3>
        <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {t(language, "Platform", "平台")}
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {t(language, "Skills", "技能")}
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {t(language, "Calls", "调用")}
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {t(language, "Confirmed", "已确认")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(["claude", "codex"] as const).map((platform) => {
                const platformSkills = skills.filter((s) => s.platform === platform);
                const platformCalls = summary
                  .filter((r) => r.platform === platform)
                  .reduce((s, r) => s + r.count, 0);
                const platformConfirmed = summary
                  .filter((r) => r.platform === platform && r.confidence === "confirmed")
                  .reduce((s, r) => s + r.count, 0);
                return (
                  <tr key={platform} className="border-b border-[hsl(var(--border))] last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium capitalize text-[hsl(var(--foreground))]">
                      {platform}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                      {platformSkills.length}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-[hsl(var(--foreground))]">
                      {platformCalls}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-emerald-500 font-semibold">
                      {platformConfirmed}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
