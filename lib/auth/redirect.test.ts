import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("внутренний путь — как есть", () => {
    expect(safeRedirectPath("/coach/join/ABC")).toBe("/coach/join/ABC");
  });
  it("внешние и мусор — на дашборд", () => {
    for (const v of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined, 5]) expect(safeRedirectPath(v)).toBe("/dashboard");
  });
  it("свой запасной путь", () => {
    expect(safeRedirectPath(null, "/coach")).toBe("/coach");
  });
});
