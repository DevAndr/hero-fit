import { describe, expect, it } from "vitest";
import { addGroup, groupKey, groupSchema, inGroup } from "./groups";

describe("groupSchema", () => {
  it("название 1…40 символов после обрезки", () => {
    const empty = groupSchema.safeParse({ name: "   " });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0].message).toBe("Введите название");
    const long = groupSchema.safeParse({ name: "а".repeat(41) });
    expect(long.error?.issues[0].message).toBe("Не больше 40 символов");
    expect(groupSchema.parse({ name: "  Утро  " }).name).toBe("Утро");
  });
});

describe("groupKey", () => {
  it("без учёта регистра и лишних пробелов", () => {
    expect(groupKey("  Утро   ПН ")).toBe("утро пн");
  });
});

describe("inGroup", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("только участники группы; группы нет — все", () => {
    expect(inGroup(rows, { id: "g", name: "Утро", clientIds: ["b"] })).toEqual([{ id: "b" }]);
    expect(inGroup(rows, null)).toEqual(rows);
    expect(inGroup(rows, undefined)).toEqual(rows);
  });
});

describe("addGroup", () => {
  it("добавляет участников из списка без повторов, в порядке списка", () => {
    expect(addGroup(["a"], ["c", "a", "x"], ["a", "b", "c"])).toEqual(["a", "c"]);
    expect(addGroup(["b"], ["c", "a"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});
