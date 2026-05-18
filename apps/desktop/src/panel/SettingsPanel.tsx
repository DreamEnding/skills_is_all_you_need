import { motion } from "framer-motion";
import {
  Settings,
  Moon,
  Sun,
  Globe,
  Database,
  FolderOpen,
  Info,
} from "lucide-react";

interface SettingsPanelProps {
  language: "en" | "zh";
}

function t(language: "en" | "zh", en: string, zh: string) {
  return language === "zh" ? zh : en;
}

const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
};

export function SettingsPanel({ language }: SettingsPanelProps) {
  const dataDir = "~/.skill-usage-manager/";

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-2xl space-y-6"
    >
      {/* General */}
      <motion.div variants={itemAnim} className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={16} className="text-[hsl(var(--primary))]" />
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t(language, "General", "通用")}
          </h3>
        </div>
        <div className="space-y-4">
          <SettingRow
            icon={<Globe size={14} />}
            label={t(language, "Language", "语言")}
            description={t(
              language,
              "Display language for the management panel",
              "管理面板的显示语言",
            )}
          >
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              {language === "en" ? "English" : "中文"}
            </span>
          </SettingRow>
          <SettingRow
            icon={<Moon size={14} />}
            label={t(language, "Theme", "主题")}
            description={t(
              language,
              "Follows system preference",
              "跟随系统偏好",
            )}
          >
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {t(language, "System", "系统")}
            </span>
          </SettingRow>
        </div>
      </motion.div>

      {/* Data */}
      <motion.div variants={itemAnim} className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Database size={16} className="text-[hsl(var(--primary))]" />
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t(language, "Data Storage", "数据存储")}
          </h3>
        </div>
        <div className="space-y-4">
          <SettingRow
            icon={<FolderOpen size={14} />}
            label={t(language, "Data Directory", "数据目录")}
            description={t(
              language,
              "All local data is stored here",
              "所有本地数据存储在此",
            )}
          >
            <code className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
              {dataDir}
            </code>
          </SettingRow>
          <SettingRow
            icon={<Database size={14} />}
            label={t(language, "Database", "数据库")}
            description={t(
              language,
              "SQLite with WAL mode",
              "SQLite WAL 模式",
            )}
          >
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              usage.db
            </span>
          </SettingRow>
        </div>
      </motion.div>

      {/* About */}
      <motion.div variants={itemAnim} className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Info size={16} className="text-[hsl(var(--primary))]" />
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t(language, "About", "关于")}
          </h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">
              {t(language, "Version", "版本")}
            </span>
            <span className="font-medium text-[hsl(var(--foreground))]">1.0.0</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">
              {t(language, "Identifier", "标识符")}
            </span>
            <span className="font-medium text-[hsl(var(--foreground))]">
              com.skill-usage-manager.desktop
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">Tauri</span>
            <span className="font-medium text-[hsl(var(--foreground))]">2.x</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[hsl(var(--muted))] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">
          {icon}
        </div>
        <div>
          <div className="text-xs font-semibold text-[hsl(var(--foreground))]">{label}</div>
          <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{description}</div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
