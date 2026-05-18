import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getInitialLanguage, translate, type Language } from "./i18n";
import {
  getUsageSummary,
  importUsageEvents,
  scanSkills as scanSkillsCommand,
  getSkillInventory,
  setSkillEnabled,
  type SkillInfo,
  type UsageSummaryInfo,
  type SkillInventoryRow,
} from "./tauriClient";

type Action = "scan" | "import" | "summary" | null;
type View = "overview" | "inventory";
type PlatformFilter = "all" | "claude" | "codex";
const languageStorageKey = "skill-usage-manager-language";

function App() {
  const [language, setLanguage] = useState<Language>(() =>
    getInitialLanguage(
      localStorage.getItem(languageStorageKey),
      navigator.language,
    ),
  );
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [summary, setSummary] = useState<UsageSummaryInfo[]>([]);
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [lastImportCount, setLastImportCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryRows, setInventoryRows] = useState<SkillInventoryRow[]>([]);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const filteredSummary = useMemo(
    () =>
      platformFilter === "all"
        ? summary
        : summary.filter((row) => row.platform === platformFilter),
    [platformFilter, summary],
  );

  const totalCalls = useMemo(
    () => filteredSummary.reduce((total, row) => total + row.count, 0),
    [filteredSummary],
  );

  const confirmedCalls = useMemo(
    () =>
      filteredSummary
        .filter((row) => row.confidence === "confirmed")
        .reduce((total, row) => total + row.count, 0),
    [filteredSummary],
  );

  const confidenceShare = totalCalls === 0 ? 0 : Math.round((confirmedCalls / totalCalls) * 100);

  const topSkills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of filteredSummary) {
      counts.set(row.canonical_name, (counts.get(row.canonical_name) ?? 0) + row.count);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [filteredSummary]);

  const platformCounts = useMemo(() => {
    const counts = { claude: 0, codex: 0 };
    for (const row of summary) {
      if (row.platform === "claude" || row.platform === "codex") {
        counts[row.platform] += row.count;
      }
    }
    return counts;
  }, [summary]);

  const filteredSkills = useMemo(() => {
    const query = inventoryQuery.trim().toLowerCase();
    return skills
      .filter((skill) => {
        const platforms = uniquePlatforms(skill);
        const platformMatch =
          platformFilter === "all" || platforms.some((platform) => platform === platformFilter);
        const queryMatch =
          query.length === 0 ||
          skill.canonical_name.toLowerCase().includes(query) ||
          skill.locations.some((location) => location.skill_path.toLowerCase().includes(query));
        return platformMatch && queryMatch;
      })
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
  }, [inventoryQuery, platformFilter, skills]);

  const filteredInventoryRows = useMemo(() => {
    const query = inventoryQuery.trim().toLowerCase();
    return inventoryRows
      .filter((row) => {
        const platformMatch =
          platformFilter === "all" || row.platform === platformFilter;
        const queryMatch =
          query.length === 0 ||
          row.canonical_name.toLowerCase().includes(query) ||
          row.skill_path.toLowerCase().includes(query);
        return platformMatch && queryMatch;
      })
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name) || a.platform.localeCompare(b.platform));
  }, [inventoryQuery, platformFilter, inventoryRows]);

  const t = useMemo(() => {
    return (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
      translate(language, key, params);
  }, [language]);
  const activeLabel = activeAction ? actionLabel(activeAction, t) : t("status.ready");

  useEffect(() => {
    void refreshSummary();
  }, []);

  useEffect(() => {
    if (view === "inventory" && inventoryRows.length === 0) {
      void loadInventory();
    }
  }, [view]);

  function selectLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    localStorage.setItem(languageStorageKey, nextLanguage);
  }

  async function runAction<T>(action: Action, task: () => Promise<T>): Promise<T | null> {
    setActiveAction(action);
    setError(null);
    try {
      return await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setActiveAction(null);
    }
  }

  async function refreshSummary() {
    const result = await runAction("summary", getUsageSummary);
    if (result) {
      setSummary(result);
    }
  }

  async function importEvents() {
    const imported = await runAction("import", importUsageEvents);
    if (imported !== null) {
      setLastImportCount(imported);
      await refreshSummary();
    }
  }

  async function scanSkills() {
    const result = await runAction("scan", scanSkillsCommand);
    if (result) {
      setSkills(result);
    }
  }

  async function loadInventory() {
    const result = await runAction("scan", getSkillInventory);
    if (result) {
      setInventoryRows(result);
    }
  }

  async function toggleSkill(locationId: number, currentState: string) {
    const newState = currentState === "on" ? "off" : "on";
    setTogglingId(locationId);
    try {
      await setSkillEnabled(locationId, newState);
      setInventoryRows((prev) =>
        prev.map((row) =>
          row.location_id === locationId ? { ...row, enabled_state: newState } : row,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="app-frame">
      <aside className="sidebar" aria-label={t("aria.primaryNavigation")}>
        <div className="brand">
          <div className="brand-mark">SUM</div>
          <div>
            <h1>{t("app.brand")}</h1>
            <span>{t("app.subtitle")}</span>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            {t("nav.overview")}
          </button>
          <button
            className={view === "inventory" ? "active" : ""}
            onClick={() => setView("inventory")}
          >
            {t("nav.inventory")}
          </button>
        </nav>

        <div className="language-switch" aria-label="Language">
          {(["en", "zh"] as Language[]).map((item) => (
            <button
              key={item}
              className={language === item ? "selected" : ""}
              onClick={() => selectLanguage(item)}
            >
              {t(item === "en" ? "language.en" : "language.zh")}
            </button>
          ))}
        </div>

        <div className="sidebar-status">
          <span>{t("status.status")}</span>
          <strong>{activeLabel}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h2>{view === "overview" ? t("views.overview") : t("views.inventory")}</h2>
          </div>
          <div className="toolbar" aria-label={t("aria.dashboardActions")}>
            <button className="primary" onClick={importEvents} disabled={activeAction !== null}>
              {activeAction === "import" ? <span className="spinner" /> : null}
              {t("actions.import")}
            </button>
            <button onClick={refreshSummary} disabled={activeAction !== null}>
              {activeAction === "summary" ? <span className="spinner" /> : null}
              {t("actions.refresh")}
            </button>
            <button onClick={scanSkills} disabled={activeAction !== null}>
              {activeAction === "scan" ? <span className="spinner" /> : null}
              {t("actions.scan")}
            </button>
          </div>
        </header>

        <div className="control-row">
          <div className="segmented" aria-label={t("aria.platformFilter")}>
            {(["all", "claude", "codex"] as PlatformFilter[]).map((platform) => (
              <button
                key={platform}
                className={platformFilter === platform ? "selected" : ""}
                onClick={() => setPlatformFilter(platform)}
              >
                {t(`filter.${platform}`)}
              </button>
            ))}
          </div>
          {lastImportCount !== null ? (
            <div className="inline-status">
              {t("status.imported", { count: lastImportCount })}
            </div>
          ) : (
            <div className="inline-status muted">{t("status.waitingImport")}</div>
          )}
        </div>

        {error ? <div className="status error">{error}</div> : null}

        {view === "overview" ? (
          <>
            <section className="metric-grid" aria-label="Usage metrics">
              <Metric label={t("metrics.totalCalls")} value={totalCalls.toLocaleString()} />
              <Metric label={t("metrics.confirmed")} value={confirmedCalls.toLocaleString()} />
              <Metric label={t("metrics.confidence")} value={`${confidenceShare}%`} />
              <Metric label={t("metrics.trackedSkills")} value={topSkills.length.toLocaleString()} />
            </section>

            <section className="content-grid">
              <div className="panel span-2">
                <PanelHeading title={t("panels.topSkills")} meta={t("meta.ranked", { count: topSkills.length })} />
                <div className="bar-list">
                  {topSkills.length === 0 ? (
                    <EmptyState text={t("empty.topSkills")} />
                  ) : (
                    topSkills.map((skill) => (
                      <BarRow
                        key={skill.name}
                        name={skill.name}
                        count={skill.count}
                        max={topSkills[0]?.count ?? 1}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="panel">
                <PanelHeading title={t("panels.platformShare")} meta={t("meta.allUsage")} />
                <div className="share-list">
                  <ShareRow label="Claude" value={platformCounts.claude} total={summaryTotal(summary)} />
                  <ShareRow label="Codex" value={platformCounts.codex} total={summaryTotal(summary)} />
                </div>
              </div>
            </section>

            <UsageTable rows={filteredSummary} t={t} />
          </>
        ) : (
          <section className="panel inventory-panel">
            <div className="inventory-toolbar">
              <PanelHeading title={t("views.inventory")} meta={t("meta.visible", { count: filteredInventoryRows.length })} />
              <input
                aria-label={t("aria.searchInventory")}
                placeholder={t("search.placeholder")}
                value={inventoryQuery}
                onChange={(event) => setInventoryQuery(event.target.value)}
              />
              <button onClick={() => void loadInventory()} disabled={activeAction !== null}>
                {activeAction === "scan" ? <span className="spinner" /> : null}
                {t("actions.scan")}
              </button>
            </div>
            <InventoryTable
              rows={filteredInventoryRows}
              togglingId={togglingId}
              onToggle={toggleSkill}
              t={t}
            />
          </section>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="panel-heading">
      <h3>{title}</h3>
      <span>{meta}</span>
    </div>
  );
}

function BarRow({ name, count, max }: { name: string; count: number; max: number }) {
  const width = max === 0 ? 0 : Math.max(8, Math.round((count / max) * 100));
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{name}</span>
        <strong>{count}</strong>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ShareRow({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="share-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="bar-track">
        <div className="bar-fill subtle" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

type Translate = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => string;

function UsageTable({ rows, t }: { rows: UsageSummaryInfo[]; t: Translate }) {
  return (
    <section className="panel">
      <PanelHeading title={t("panels.usageSummary")} meta={t("meta.rows", { count: rows.length })} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("tables.skill")}</th>
              <th>{t("tables.platform")}</th>
              <th>{t("tables.confidence")}</th>
              <th className="numeric">{t("tables.calls")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState text={t("empty.usage")} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.canonical_name}-${row.platform}-${row.confidence}`}>
                  <td>{row.canonical_name}</td>
                  <td>{row.platform}</td>
                  <td>
                    <span className={`badge ${row.confidence}`}>{row.confidence}</span>
                  </td>
                  <td className="numeric">{row.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InventoryTable({
  rows,
  togglingId,
  onToggle,
  t,
}: {
  rows: SkillInventoryRow[];
  togglingId: number | null;
  onToggle: (locationId: number, currentState: string) => void;
  t: Translate;
}) {
  return (
    <div className="table-wrap inventory-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("tables.skill")}</th>
            <th>{t("tables.platform")}</th>
            <th>{t("tables.state")}</th>
            <th className="toggle-col">{t("tables.enabled")}</th>
            <th>{t("tables.locations")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState text={t("empty.inventory")} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.location_id}>
                <td>{row.canonical_name}</td>
                <td>
                  <span className={`badge platform-${row.platform}`}>{row.platform}</span>
                </td>
                <td>
                  <span className={`badge state-${row.enabled_state}`}>{row.enabled_state}</span>
                </td>
                <td className="toggle-col">
                  {row.supports_exact_disable ? (
                    <button
                      className={`toggle-switch ${row.enabled_state === "on" ? "active" : ""}`}
                      disabled={togglingId === row.location_id}
                      onClick={() => onToggle(row.location_id, row.enabled_state)}
                      title={row.enabled_state === "on" ? "Disable" : "Enable"}
                    >
                      <span className="toggle-knob" />
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="path-col" title={row.skill_path}>
                  {row.skill_path}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function uniquePlatforms(skill: SkillInfo): string[] {
  return Array.from(new Set(skill.locations.map((location) => location.platform)));
}

function summaryTotal(rows: UsageSummaryInfo[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

function actionLabel(action: Exclude<Action, null>, t: Translate) {
  switch (action) {
    case "scan":
      return t("status.scanning");
    case "import":
      return t("status.importing");
    case "summary":
      return t("status.refreshing");
  }
}

export default App;
