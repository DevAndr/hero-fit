import { describe, expect, it } from "vitest";
import { flagPatchSchema, percentInput, pickFlagUser } from "./schema";

const error = (patch: unknown) => {
  const r = flagPatchSchema.safeParse(patch);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("flagPatchSchema", () => {
  it("процент — целое 0…100", () => {
    expect(error({ percent: 101 })).toBe("Процент — от 0 до 100");
    expect(error({ percent: -1 })).toBe("Процент — от 0 до 100");
    expect(error({ percent: 2.5 })).toBe("Процент — от 0 до 100");
    expect(error({ percent: 25 })).toBeNull();
  });

  it("пустой логин — ошибка, лишние пробелы обрезаются", () => {
    expect(error({ addUser: "   " })).toBe("Введите логин или ник");
    expect(flagPatchSchema.parse({ addUser: "  demo " }).addUser).toBe("demo");
  });

  it("переключатель и удаление", () => {
    expect(error({ enabled: true })).toBeNull();
    expect(error({ removeUserId: "u1" })).toBeNull();
  });
});

describe("pickFlagUser", () => {
  it("точный логин важнее чужого ника", () => {
    expect(pickFlagUser({ id: "a" }, { id: "b" })).toBe("a");
  });

  it("нет логина — по нику; ничего — null", () => {
    expect(pickFlagUser(null, { id: "b" })).toBe("b");
    expect(pickFlagUser(null, null)).toBeNull();
  });
});

describe("percentInput", () => {
  it("пустое поле — не 0 %, а «нет значения»", () => {
    expect(percentInput("")).toBeNull();
    expect(percentInput("   ")).toBeNull();
  });
  it("число с пробелами — число, мусор — NaN (его отвергнет схема)", () => {
    expect(percentInput(" 25 ")).toBe(25);
    expect(percentInput("0")).toBe(0);
    expect(Number.isNaN(percentInput("abc"))).toBe(true);
  });
});
