import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECOVERY_DOT, RECOVERY_FILL } from "@/lib/progress/recovery-colors";

const css = readFileSync("app/globals.css", "utf8");
const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
const token = (selector: string, name: string) => block(selector).match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

describe("цвета восстановления", () => {
  it("«можно нагружать» — свой токен, не акцент темы", () => {
    expect(RECOVERY_FILL.ready).toBe("fill-recovery-ready");
    expect(RECOVERY_DOT.ready).toBe("bg-recovery-ready");
  });

  it("ни один статус не берёт цвет акцента — тема магазина его перекрашивает", () => {
    for (const cls of [...Object.values(RECOVERY_FILL), ...Object.values(RECOVERY_DOT)]) {
      expect(cls).not.toMatch(/primary|chart-/);
    }
  });

  it("--recovery-ready — фирменный зелёный стандартной темы в обоих режимах", () => {
    for (const selector of [":root", ".dark"]) {
      expect(token(selector, "recovery-ready"), selector).toBe(token(selector, "primary"));
    }
    expect(css).toContain("--color-recovery-ready: var(--recovery-ready);");
  });
});
