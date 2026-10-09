import { describe, expect, it } from "vitest";
import { registerSchema } from "./schemas";

const valid = { login: "hero", email: "hero@test.local", name: "", password: "Secret123", confirmPassword: "Secret123" };

describe("registerSchema — согласие на обработку данных", () => {
  it("без галочки не регистрирует", () => {
    const r = registerSchema.safeParse(valid);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain("consent");
  });

  it("с галочкой проходит", () => {
    expect(registerSchema.safeParse({ ...valid, consent: "on" }).success).toBe(true);
  });
});
