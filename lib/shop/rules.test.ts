import { describe, expect, it } from "vitest";
import { itemByCode, type ShopItem } from "@/lib/shop/catalog";
import { canBuy, canEquip } from "@/lib/shop/rules";

const gold = itemByCode("frame:gold")!; // rare, 300
const free = itemByCode("avatar:knight")!;
const premium: ShopItem = { ...gold, acquire: "premium" };

describe("canBuy", () => {
  it("нет предмета или не в продаже", () => {
    expect(canBuy(null, false, 9999)).toEqual({ ok: false, error: "Нет в продаже" });
    expect(canBuy(premium, false, 9999)).toEqual({ ok: false, error: "Нет в продаже" });
    expect(canBuy(free, false, 9999)).toEqual({ ok: false, error: "Нет в продаже" });
  });
  it("уже куплено", () => {
    expect(canBuy(gold, true, 9999)).toEqual({ ok: false, error: "Уже куплено" });
  });
  it("не хватает монет", () => {
    const r = canBuy(gold, false, 250);
    expect(r).toEqual({ ok: false, error: "Не хватает 50 монет", short: 50 });
  });
  it("хватает", () => {
    expect(canBuy(gold, false, 300)).toEqual({ ok: true });
  });
});

describe("canEquip", () => {
  it("чужой вид — нельзя", () => {
    expect(canEquip(gold, "avatar", true)).toBe(false);
    expect(canEquip(null, "frame", true)).toBe(false);
  });
  it("бесплатный — можно без владения", () => {
    expect(canEquip(free, "avatar", false)).toBe(true);
  });
  it("платный — только купленный", () => {
    expect(canEquip(gold, "frame", false)).toBe(false);
    expect(canEquip(gold, "frame", true)).toBe(true);
  });
});
