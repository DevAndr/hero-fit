import { describe, expect, it } from "vitest";
import { RECOVERY_DOT, RECOVERY_FILL } from "@/lib/progress/recovery-colors";

describe("цвета восстановления", () => {
  it("«можно нагружать» — смысловой зелёный, не акцент темы", () => {
    expect(RECOVERY_FILL.ready).toBe("fill-recovery-green");
    expect(RECOVERY_DOT.ready).toBe("bg-recovery-green");
  });

  it("ни один статус не берёт цвет акцента — тема магазина его перекрашивает", () => {
    for (const cls of [...Object.values(RECOVERY_FILL), ...Object.values(RECOVERY_DOT)]) {
      expect(cls).not.toMatch(/primary|chart-/);
    }
  });
});
