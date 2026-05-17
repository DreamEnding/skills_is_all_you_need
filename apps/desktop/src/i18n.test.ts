import { describe, expect, test } from "vitest";
import { getInitialLanguage, translate } from "./i18n";

describe("i18n", () => {
  test("translates interface labels to Chinese and English", () => {
    expect(translate("en", "actions.import")).toBe("Import");
    expect(translate("zh", "actions.import")).toBe("导入");
    expect(translate("zh", "views.inventory")).toBe("技能清单");
  });

  test("interpolates numeric status text", () => {
    expect(translate("en", "status.imported", { count: 3 })).toBe("Imported 3 new event(s)");
    expect(translate("zh", "status.imported", { count: 3 })).toBe("已导入 3 条新事件");
  });

  test("prefers stored language and falls back to browser language", () => {
    expect(getInitialLanguage("zh", "en-US")).toBe("zh");
    expect(getInitialLanguage(null, "zh-CN")).toBe("zh");
    expect(getInitialLanguage(null, "fr-FR")).toBe("en");
  });
});
