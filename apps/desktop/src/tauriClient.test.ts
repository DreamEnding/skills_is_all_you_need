import { describe, expect, test } from "vitest";
import { getUsageSummary } from "./tauriClient";

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
});
