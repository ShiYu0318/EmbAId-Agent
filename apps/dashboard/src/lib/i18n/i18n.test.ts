import { describe, expect, it } from "vitest";

import { createTranslator } from "@/lib/i18n";

describe("createTranslator", () => {
  it("resolves a zh-TW string", () => {
    const t = createTranslator("zh-TW");
    expect(t("nav.overview")).toBe("總覽");
  });

  it("resolves an en string", () => {
    const t = createTranslator("en");
    expect(t("nav.overview")).not.toBe("");
    expect(t("nav.overview")).not.toBe("nav.overview");
  });

  it("interpolates parameters", () => {
    const t = createTranslator("zh-TW");
    expect(t("knowledgeGaps.occurrences", { count: 5 })).toContain("5");
  });

  it("returns the key path for an unknown key", () => {
    const t = createTranslator("zh-TW");
    expect(t("does.not.exist")).toBe("does.not.exist");
  });
});
