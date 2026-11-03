import { describe, expect, it } from "vitest";

import { createTranslator, initialLocale } from "@/lib/i18n";

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

describe("initialLocale", () => {
  const setUrl = (search: string) => window.history.replaceState(null, "", `/${search}`);

  it("prefers ?lang= over the saved choice and the browser", () => {
    window.localStorage.setItem("embaid.locale", "zh-TW");
    setUrl("?lang=en");
    expect(initialLocale()).toBe("en");
  });

  it("falls back to the saved choice, then to the browser language", () => {
    setUrl("");
    window.localStorage.setItem("embaid.locale", "zh-TW");
    expect(initialLocale()).toBe("zh-TW");
    window.localStorage.removeItem("embaid.locale");
    expect(initialLocale()).toBe(navigator.language.toLowerCase().startsWith("zh") ? "zh-TW" : "en");
  });
});
