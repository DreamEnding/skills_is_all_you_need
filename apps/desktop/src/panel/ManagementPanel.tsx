import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Settings,
  RefreshCw,
  Search,
  Sun,
  Moon,
  Shield,
  Activity,
  Package,
  ChevronRight,
} from "lucide-react";
import {
  getSkillInventory,
  setSkillEnabled,
  getUsageSummary,
  importUsageEvents,
  type SkillInventoryRow,
  type UsageSummaryInfo,
} from "../tauriClient";
import { SkillListPanel } from "./SkillListPanel";
import { OverviewPanel } from "./OverviewPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { SettingsPanel } from "./SettingsPanel";

type PanelView = "overview" | "skills" | "diagnostics" | "settings";

const navItems: { id: PanelView; label: string; labelZh: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", labelZh: "概览", icon: BarChart3 },
  { id: "skills", label: "Skills", labelZh: "技能", icon: Package },
  { id: "diagnostics", label: "Diagnostics", labelZh: "诊断", icon: Shield },
  { id: "settings", label: "Settings", labelZh: "设置", icon: Settings },
];

export function ManagementPanel() {
  const [view, setView] = useState<PanelView>("overview");
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [language, setLanguage] = useState<"en" | "zh">(() => {
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  });
  const [skills, setSkills] = useState<SkillInventoryRow[]>([]);
  const [summary, setSummary] = useState<UsageSummaryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const t = useCallback(
    (en: string, zh: string) => (language === "zh" ? zh : en),
    [language],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [inventoryData, summaryData] = await Promise.all([
        getSkillInventory().catch(() => []),
        getUsageSummary().catch(() => []),
      ]);
      setSkills(inventoryData);
      setSummary(summaryData);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await importUsageEvents().catch(() => {});
    await loadAll();
  }

  async function toggleSkill(locationId: number, currentState: string) {
    const newState = currentState === "on" ? "off" : "on";
    try {
      await setSkillEnabled(locationId, newState);
      setSkills((prev) =>
        prev.map((row) =>
          row.location_id === locationId ? { ...row, enabled_state: newState } : row,
        ),
      );
    } catch (e) {
      console.error("Toggle failed:", e);
    }
  }

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return skills;
    return skills.filter(
      (s) =>
        s.canonical_name.toLowerCase().includes(query) ||
        s.skill_path.toLowerCase().includes(query),
    );
  }, [skills, searchQuery]);

  const totalCalls = useMemo(
    () => summary.reduce((total, row) => total + row.count, 0),
    [summary],
  );

  const enabledCount = useMemo(
    () => skills.filter((s) => s.enabled_state === "on").length,
    [skills],
  );

  const sidebarWidth = 220;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -sidebarWidth, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-full flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]"
        style={{ width: sidebarWidth, minWidth: sidebarWidth }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white text-xs font-extrabold">
            SM
          </div>
          <div>
            <div className="text-sm font-bold text-[hsl(var(--foreground))]">
              {t("Skill Manager", "技能管理")}
            </div>
            <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {t("Management Panel", "管理面板")}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <motion.button
                key={item.id}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setView(item.id)}
                className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <Icon size={16} />
                {t(item.label, item.labelZh)}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="ml-auto h-1 w-1 rounded-full bg-[hsl(var(--primary))]"
                  />
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-[hsl(var(--border))] px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] transition-colors"
              title={t("Refresh", "刷新")}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setDark(!dark)}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] transition-colors"
              title={t("Toggle theme", "切换主题")}
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={() => setLanguage(language === "en" ? "zh" : "en")}
              className="flex h-8 items-center justify-center rounded-md px-2 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] text-xs font-medium transition-colors"
            >
              {language === "en" ? "中" : "EN"}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header bar */}
        <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {t(
                navItems.find((n) => n.id === view)?.label ?? "Overview",
                navItems.find((n) => n.id === view)?.labelZh ?? "概览",
              )}
            </h1>
            {loading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-4 w-4"
              >
                <RefreshCw size={14} className="animate-spin text-[hsl(var(--primary))]" />
              </motion.div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search skills...", "搜索技能...")}
                className="h-8 w-56 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-8 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none focus:border-[hsl(var(--ring))] focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            {/* Stats chips */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary))]/10 px-3 py-1 text-xs font-medium text-[hsl(var(--primary))]">
                <Package size={12} />
                {skills.length} {t("skills", "技能")}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Activity size={12} />
                {enabledCount} {t("on", "启用")}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--secondary))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                <BarChart3 size={12} />
                {totalCalls} {t("calls", "调用")}
              </div>
            </div>
          </div>
        </header>

        {/* Content area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 overflow-y-auto overflow-x-hidden p-6"
          >
            {view === "overview" && (
              <OverviewPanel
                summary={summary}
                skills={skills}
                language={language}
              />
            )}
            {view === "skills" && (
              <SkillListPanel
                skills={filteredSkills}
                toggling={loading}
                onToggle={toggleSkill}
                language={language}
              />
            )}
            {view === "diagnostics" && (
              <DiagnosticsPanel
                skills={skills}
                summary={summary}
                language={language}
                onRefresh={refresh}
              />
            )}
            {view === "settings" && (
              <SettingsPanel language={language} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
