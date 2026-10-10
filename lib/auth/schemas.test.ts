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

describe("registerSchema — регистрация тренера", () => {
  const base = { ...valid, consent: "on" };
  it("без галочки ник не нужен", () => {
    const r = registerSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.coach).toBe(false);
  });
  it("с галочкой нужен ник", () => {
    const r = registerSchema.safeParse({ ...base, coach: "on", nickname: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain("nickname");
  });
  it("с галочкой и ником — тренер", () => {
    const r = registerSchema.safeParse({ ...base, coach: "on", nickname: " Coach_Ivan " });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ coach: true, nickname: "Coach_Ivan" });
  });
  it("ник проверяется как в настройках", () => {
    expect(registerSchema.safeParse({ ...base, coach: "on", nickname: "ив ан" }).success).toBe(false);
  });
});
