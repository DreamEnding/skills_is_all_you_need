import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  getUsageSummary,
  importUsageEvents,
  scanSkills as scanSkillsCommand,
  type SkillInfo,
  type UsageSummaryInfo,
} from "./tauriClient";

type Action = "scan" | "import" | "summary" | null;
type View = "overview" | "inventory";
type PlatformFilter = "all" | "claude" | "codex";

function App() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [summary, setSummary] = useState<UsageSummaryInfo[]>([]);
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [lastImportCount, setLastImportCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [inventoryQuery, setInventoryQuery] = useState("");

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

  const activeLabel = activeAction ? actionLabel(activeAction) : "Ready";

  useEffect(() => {
    void refreshSummary();
  }, []);

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

  return (
    <main className="app-frame">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">SUM</div>
          <div>
            <h1>Skill Usage</h1>
            <span>Local manager</span>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            Overview
          </button>
          <button
            className={view === "inventory" ? "active" : ""}
            onClick={() => setView("inventory")}
          >
            Inventory
          </button>
        </nav>

        <div className="sidebar-status">
          <span>Status</span>
          <strong>{activeLabel}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Skills analytics</p>
            <h2>{view === "overview" ? "Usage overview" : "Skill inventory"}</h2>
          </div>
          <div className="toolbar" aria-label="Dashboard actions">
            <button className="primary" onClick={importEvents} disabled={activeAction !== null}>
              {activeAction === "import" ? <span className="spinner" /> : null}
              Import
            </button>
            <button onClick={refreshSummary} disabled={activeAction !== null}>
              {activeAction === "summary" ? <span className="spinner" /> : null}
              Refresh
            </button>
            <button onClick={scanSkills} disabled={activeAction !== null}>
              {activeAction === "scan" ? <span className="spinner" /> : null}
              Scan
            </button>
          </div>
        </header>

        <div className="control-row">
          <div className="segmented" aria-label="Platform filter">
            {(["all", "claude", "codex"] as PlatformFilter[]).map((platform) => (
              <button
                key={platform}
                className={platformFilter === platform ? "selected" : ""}
                onClick={() => setPlatformFilter(platform)}
              >
                {platform}
              </button>
            ))}
          </div>
          {lastImportCount !== null ? (
            <div className="inline-status">Imported {lastImportCount} new event(s)</div>
          ) : (
            <div className="inline-status muted">Waiting for import</div>
          )}
        </div>

        {error ? <div className="status error">{error}</div> : null}

        {view === "overview" ? (
          <>
            <section className="metric-grid" aria-label="Usage metrics">
              <Metric label="Total calls" value={totalCalls.toLocaleString()} />
              <Metric label="Confirmed" value={confirmedCalls.toLocaleString()} />
              <Metric label="Confidence" value={`${confidenceShare}%`} />
              <Metric label="Tracked skills" value={topSkills.length.toLocaleString()} />
            </section>

            <section className="content-grid">
              <div className="panel span-2">
                <PanelHeading title="Top skills" meta={`${topSkills.length} ranked`} />
                <div className="bar-list">
                  {topSkills.length === 0 ? (
                    <EmptyState text="Import queued events to populate usage rankings." />
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
                <PanelHeading title="Platform share" meta="all usage" />
                <div className="share-list">
                  <ShareRow label="Claude" value={platformCounts.claude} total={summaryTotal(summary)} />
                  <ShareRow label="Codex" value={platformCounts.codex} total={summaryTotal(summary)} />
                </div>
              </div>
            </section>

            <UsageTable rows={filteredSummary} />
          </>
        ) : (
          <section className="panel inventory-panel">
            <div className="inventory-toolbar">
              <PanelHeading title="Skill inventory" meta={`${filteredSkills.length} visible`} />
              <input
                aria-label="Search inventory"
                placeholder="Search skills or paths"
                value={inventoryQuery}
                onChange={(event) => setInventoryQuery(event.target.value)}
              />
            </div>
            <InventoryTable skills={filteredSkills} />
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

function UsageTable({ rows }: { rows: UsageSummaryInfo[] }) {
  return (
    <section className="panel">
      <PanelHeading title="Usage summary" meta={`${rows.length} row(s)`} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Skill</th>
              <th>Platform</th>
              <th>Confidence</th>
              <th className="numeric">Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState text="No usage events match the current filter." />
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

function InventoryTable({ skills }: { skills: SkillInfo[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Skill</th>
            <th>Platforms</th>
            <th className="numeric">Locations</th>
          </tr>
        </thead>
        <tbody>
          {skills.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <EmptyState text="Run a scan or adjust the filter to see local Skills." />
              </td>
            </tr>
          ) : (
            skills.map((skill) => (
              <tr key={skill.canonical_name}>
                <td>{skill.canonical_name}</td>
                <td>{uniquePlatforms(skill).join(", ")}</td>
                <td className="numeric">{skill.locations.length}</td>
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

function actionLabel(action: Exclude<Action, null>) {
  switch (action) {
    case "scan":
      return "Scanning";
    case "import":
      return "Importing";
    case "summary":
      return "Refreshing";
  }
}

export default App;
