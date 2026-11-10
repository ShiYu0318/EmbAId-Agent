import { describe, expect, it } from "vitest";

import { parseOAuthFragment, safeNextPath } from "./oauth-callback";

describe("parseOAuthFragment", () => {
  it("reads tokens from the fragment", () => {
    expect(parseOAuthFragment("#access_token=a&refresh_token=r&next=%2Fprojects")).toEqual({
      access: "a",
      refresh: "r",
      next: "/projects",
    });
  });

  it("returns null when a token is missing", () => {
    expect(parseOAuthFragment("#access_token=a")).toBeNull();
    expect(parseOAuthFragment("")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps relative paths", () => {
    expect(safeNextPath("/settings?tab=keys")).toBe("/settings?tab=keys");
  });

  it("drops external targets", () => {
    for (const target of ["https://evil.example.org", "//evil.example.org", "/\\evil", "", null]) {
      expect(safeNextPath(target)).toBe("/");
    }
  });
});
