import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("внутренний путь — как есть", () => {
    expect(safeRedirectPath("/coach/join/ABC")).toBe("/coach/join/ABC");
  });
  it("внешние и мусор — на дашборд", () => {
    for (const v of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined, 5]) expect(safeRedirectPath(v)).toBe("/dashboard");
  });
  it("табуляция и переводы строк не обходят проверку (браузер их вырезает)", () => {
    for (const v of ["/\t/evil.com", "/\n/evil.com", "/\r\\evil.com", "/\t\\evil.com"]) expect(safeRedirectPath(v)).toBe("/dashboard");
  });
  it("путь с запросом и якорем сохраняется", () => {
    expect(safeRedirectPath("/register?next=%2Fcoach#x")).toBe("/register?next=%2Fcoach#x");
  });
  it("свой запасной путь", () => {
    expect(safeRedirectPath(null, "/coach")).toBe("/coach");
  });
});
