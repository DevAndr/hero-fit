import { describe, expect, it } from "vitest";
import type { FlagState } from "@/lib/flags/eval";
import { isSkin, itemByCode } from "@/lib/shop/catalog";
import { visibleCosmetics } from "@/lib/shop/cosmetics";
import { themeStyle } from "@/lib/shop/theme-style";

const row = { id: "u1", avatarCode: "avatar:knight", frameCode: "frame:gold", nickColorCode: "nick:emerald" };
const on: FlagState = { enabled: true, percent: 100, userIds: [] };

describe("visibleCosmetics", () => {
  it("флаг выключен, даже со списком — пусто", () => {
    const off: FlagState = { enabled: false, percent: 100, userIds: ["u1"] };
    expect(visibleCosmetics(row, off)).toEqual({ avatar: null, frame: null, nickColor: null });
    expect(visibleCosmetics(row, null)).toEqual({ avatar: null, frame: null, nickColor: null });
  });
  it("неизвестный код — null, остальные сохраняются", () => {
    const c = visibleCosmetics({ ...row, frameCode: "frame:gone", nickColorCode: null }, on);
    expect(c.frame).toBeNull();
    expect(c.nickColor).toBeNull();
    expect(c.avatar).toBe("avatar:knight");
  });
  it("код другого вида в поле — null", () => {
    expect(visibleCosmetics({ ...row, avatarCode: "frame:gold" }, on).avatar).toBeNull();
  });
});

describe("themeStyle", () => {
  it("содержит --primary и блок .dark", () => {
    const item = itemByCode("theme:ocean") ?? undefined;
    expect(item?.kind).toBe("theme");
    if (item?.kind !== "theme" || isSkin(item)) return;
    const css = themeStyle(item);
    expect(css).toContain("--primary:");
    expect(css).toContain(".dark");
    expect(css).toContain(item.dark.primary);
    expect(css).toContain(item.light.primary);
  });
});
