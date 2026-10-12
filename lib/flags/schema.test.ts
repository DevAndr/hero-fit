import { describe, expect, it } from "vitest";
import { flagPatchSchema, pickFlagUser } from "./schema";

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
