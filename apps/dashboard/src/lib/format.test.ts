import { describe, expect, it } from "vitest";

import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";

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
