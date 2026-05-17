import { afterEach, describe, expect, test, vi } from "vitest";
import { getUsageSummary, scanSkills } from "./tauriClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tauri client fallback", () => {
  test("returns preview data instead of throwing outside Tauri", async () => {
    const rows = await getUsageSummary();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      canonical_name: expect.any(String),
      platform: expect.any(String),
      confidence: expect.any(String),
      count: expect.any(Number),
    });
  });

  test("uses the Vite dev scan endpoint outside Tauri when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            canonical_name: "openai-docs",
            locations: [{ platform: "codex", skill_path: "C:/Users/example/.codex/skills/openai-docs/SKILL.md" }],
          },
        ],
      })),
    );

    const rows = await scanSkills();

    expect(fetch).toHaveBeenCalledWith("/api/scan-skills");
    expect(rows[0].canonical_name).toBe("openai-docs");
  });
});
