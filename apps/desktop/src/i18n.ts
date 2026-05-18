export type Language = "en" | "zh";

type TranslationKey =
  | "actions.import"
  | "actions.refresh"
  | "actions.scan"
  | "app.brand"
  | "app.subtitle"
  | "app.eyebrow"
  | "aria.dashboardActions"
  | "aria.platformFilter"
  | "aria.primaryNavigation"
  | "aria.searchInventory"
  | "metrics.totalCalls"
  | "metrics.confirmed"
  | "metrics.confidence"
  | "metrics.trackedSkills"
  | "nav.overview"
  | "nav.inventory"
  | "panels.platformShare"
  | "panels.topSkills"
  | "panels.usageSummary"
  | "status.imported"
  | "status.importing"
  | "status.ready"
  | "status.refreshing"
  | "status.scanning"
  | "status.status"
  | "status.waitingImport"
  | "status.toggling"
  | "status.toggleSuccess"
  | "status.toggleError"
  | "tables.calls"
  | "tables.confidence"
  | "tables.locations"
  | "tables.platform"
  | "tables.platforms"
  | "tables.skill"
  | "tables.enabled"
  | "tables.state"
  | "views.inventory"
  | "views.overview"
  | "empty.inventory"
  | "empty.topSkills"
  | "empty.usage"
  | "filter.all"
  | "filter.claude"
  | "filter.codex"
  | "meta.allUsage"
  | "meta.ranked"
  | "meta.rows"
  | "meta.visible"
  | "search.placeholder"
  | "language.en"
  | "language.zh";

type TranslationParams = Record<string, string | number>;

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    "actions.import": "Import",
    "actions.refresh": "Refresh",
    "actions.scan": "Scan",
    "app.brand": "Skill Usage",
    "app.subtitle": "Local manager",
    "app.eyebrow": "Skills analytics",
    "aria.dashboardActions": "Dashboard actions",
    "aria.platformFilter": "Platform filter",
    "aria.primaryNavigation": "Primary navigation",
    "aria.searchInventory": "Search inventory",
    "metrics.totalCalls": "Total calls",
    "metrics.confirmed": "Confirmed",
    "metrics.confidence": "Confidence",
    "metrics.trackedSkills": "Tracked skills",
    "nav.overview": "Overview",
    "nav.inventory": "Inventory",
    "panels.platformShare": "Platform share",
    "panels.topSkills": "Top skills",
    "panels.usageSummary": "Usage summary",
    "status.imported": "Imported {count} new event(s)",
    "status.importing": "Importing",
    "status.ready": "Ready",
    "status.refreshing": "Refreshing",
    "status.scanning": "Scanning",
    "status.status": "Status",
    "status.waitingImport": "Waiting for import",
    "status.toggling": "Toggling",
    "status.toggleSuccess": "Skill state updated",
    "status.toggleError": "Toggle failed",
    "tables.calls": "Calls",
    "tables.confidence": "Confidence",
    "tables.locations": "Locations",
    "tables.platform": "Platform",
    "tables.platforms": "Platforms",
    "tables.skill": "Skill",
    "tables.enabled": "Enabled",
    "tables.state": "State",
    "views.inventory": "Skill inventory",
    "views.overview": "Usage overview",
    "empty.inventory": "Run a scan or adjust the filter to see local Skills.",
    "empty.topSkills": "Import queued events to populate usage rankings.",
    "empty.usage": "No usage events match the current filter.",
    "filter.all": "All",
    "filter.claude": "Claude",
    "filter.codex": "Codex",
    "meta.allUsage": "all usage",
    "meta.ranked": "{count} ranked",
    "meta.rows": "{count} row(s)",
    "meta.visible": "{count} visible",
    "search.placeholder": "Search skills or paths",
    "language.en": "EN",
    "language.zh": "中",
  },
  zh: {
    "actions.import": "导入",
    "actions.refresh": "刷新",
    "actions.scan": "扫描",
    "app.brand": "技能用量",
    "app.subtitle": "本地管理器",
    "app.eyebrow": "技能分析",
    "aria.dashboardActions": "仪表盘操作",
    "aria.platformFilter": "平台筛选",
    "aria.primaryNavigation": "主导航",
    "aria.searchInventory": "搜索技能清单",
    "metrics.totalCalls": "总调用",
    "metrics.confirmed": "确认调用",
    "metrics.confidence": "可信占比",
    "metrics.trackedSkills": "跟踪技能",
    "nav.overview": "概览",
    "nav.inventory": "清单",
    "panels.platformShare": "平台占比",
    "panels.topSkills": "高频技能",
    "panels.usageSummary": "用量汇总",
    "status.imported": "已导入 {count} 条新事件",
    "status.importing": "正在导入",
    "status.ready": "就绪",
    "status.refreshing": "正在刷新",
    "status.scanning": "正在扫描",
    "status.status": "状态",
    "status.waitingImport": "等待导入",
    "status.toggling": "切换中",
    "status.toggleSuccess": "技能状态已更新",
    "status.toggleError": "切换失败",
    "tables.calls": "调用",
    "tables.confidence": "可信度",
    "tables.locations": "位置数",
    "tables.platform": "平台",
    "tables.platforms": "平台",
    "tables.skill": "技能",
    "tables.enabled": "启用",
    "tables.state": "状态",
    "views.inventory": "技能清单",
    "views.overview": "用量概览",
    "empty.inventory": "运行扫描或调整筛选条件以查看本地技能。",
    "empty.topSkills": "导入队列事件后会显示用量排行。",
    "empty.usage": "当前筛选条件下没有用量事件。",
    "filter.all": "全部",
    "filter.claude": "Claude",
    "filter.codex": "Codex",
    "meta.allUsage": "全部用量",
    "meta.ranked": "{count} 项排行",
    "meta.rows": "{count} 行",
    "meta.visible": "{count} 项可见",
    "search.placeholder": "搜索技能或路径",
    "language.en": "EN",
    "language.zh": "中",
  },
};

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    translations[language][key],
  );
}

export function getInitialLanguage(
  storedLanguage: string | null | undefined,
  browserLanguage: string | undefined,
): Language {
  if (storedLanguage === "en" || storedLanguage === "zh") {
    return storedLanguage;
  }
  return browserLanguage?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
