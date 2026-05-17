import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface SkillInfo {
  canonical_name: string;
  locations: { platform: string; skill_path: string }[];
}

interface UsageSummaryInfo {
  canonical_name: string;
  platform: string;
  confidence: string;
  count: number;
}

type Action = "scan" | "import" | "summary" | null;

function App() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [summary, setSummary] = useState<UsageSummaryInfo[]>([]);
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [lastImportCount, setLastImportCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCalls = useMemo(
    () => summary.reduce((total, row) => total + row.count, 0),
    [summary],
  );
  const confirmedCalls = useMemo(
    () =>
      summary
        .filter((row) => row.confidence === "confirmed")
        .reduce((total, row) => total + row.count, 0),
    [summary],
  );
  const topSkill = summary[0]?.canonical_name ?? "No usage yet";

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
    const result = await runAction("summary", () =>
      invoke<UsageSummaryInfo[]>("get_usage_summary"),
    );
    if (result) {
      setSummary(result);
    }
  }

  async function importEvents() {
    const imported = await runAction("import", () => invoke<number>("import_usage_events"));
    if (imported !== null) {
      setLastImportCount(imported);
      await refreshSummary();
    }
  }

  async function scanSkills() {
    const result = await runAction("scan", () => invoke<SkillInfo[]>("scan_skills"));
    if (result) {
      setSkills(result);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Skill Usage Manager</h1>
          <p>Local Skills usage, inventory, and hook ingest status.</p>
        </div>
        <div className="toolbar" aria-label="Dashboard actions">
          <button onClick={importEvents} disabled={activeAction !== null}>
            {activeAction === "import" ? "Importing" : "Import Events"}
          </button>
          <button onClick={refreshSummary} disabled={activeAction !== null}>
            {activeAction === "summary" ? "Refreshing" : "Refresh Summary"}
          </button>
          <button onClick={scanSkills} disabled={activeAction !== null}>
            {activeAction === "scan" ? "Scanning" : "Scan Skills"}
          </button>
        </div>
      </header>

      {error && <div className="status error">{error}</div>}
      {lastImportCount !== null && (
        <div className="status">Imported {lastImportCount} new event(s).</div>
      )}

      <section className="metric-grid" aria-label="Usage metrics">
        <div className="metric">
          <span>Total Calls</span>
          <strong>{totalCalls}</strong>
        </div>
        <div className="metric">
          <span>Confirmed Calls</span>
          <strong>{confirmedCalls}</strong>
        </div>
        <div className="metric">
          <span>Tracked Skills</span>
          <strong>{summary.length}</strong>
        </div>
        <div className="metric">
          <span>Top Skill</span>
          <strong className="metric-name">{topSkill}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Usage Summary</h2>
          <span>{summary.length} row(s)</span>
        </div>
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
            {summary.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No imported usage events.
                </td>
              </tr>
            ) : (
              summary.map((row) => (
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
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Skill Inventory</h2>
          <span>{skills.length} skill(s)</span>
        </div>
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
                <td colSpan={3} className="empty">
                  Run a scan to load local Skills.
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
      </section>
    </main>
  );
}

function uniquePlatforms(skill: SkillInfo): string[] {
  return Array.from(new Set(skill.locations.map((location) => location.platform)));
}

export default App;
