import { describe, expect, it } from "vitest";

import { formatDecimal, formatNumber, formatPercent, parseTimestamp } from "@/lib/format";

describe("format helpers", () => {
  it("formats an integer", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
  });

  it("formats a percent", () => {
    expect(formatPercent(0.5, "en")).toBe("50%");
  });

  it("returns a dash for a null percent", () => {
    expect(formatPercent(null, "en")).toBe("—");
  });

  it("formats a decimal with two digits", () => {
    expect(formatDecimal(0.827)).toBe("0.83");
  });
});

describe("parseTimestamp", () => {
  it("reads bare API timestamps as UTC", () => {
    expect(parseTimestamp("2026-11-02T03:40:10").toISOString()).toBe("2026-11-02T03:40:10.000Z");
  });

  it("keeps an explicit offset", () => {
    expect(parseTimestamp("2026-11-02T11:40:10+08:00").toISOString()).toBe("2026-11-02T03:40:10.000Z");
    expect(parseTimestamp("2026-11-02T03:40:10Z").toISOString()).toBe("2026-11-02T03:40:10.000Z");
  });
});
