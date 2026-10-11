import { describe, expect, it } from "vitest";
import { GUILD_EMBLEMS, guildKey, guildNameSchema, isEmblem, joinBlock, leaveBlock } from "./rules";

describe("guildNameSchema", () => {
  it("3…24 символа после обрезки", () => {
    expect(guildNameSchema.safeParse("ab").error?.issues[0].message).toBe("Не короче 3 символов");
    expect(guildNameSchema.safeParse("а".repeat(25)).error?.issues[0].message).toBe("Не длиннее 24 символов");
    expect(guildNameSchema.parse("  Железные  ")).toBe("Железные");
  });
});

describe("guildKey", () => {
  it("без регистра и лишних пробелов", () => {
    expect(guildKey("  Железные   Кулаки ")).toBe("железные кулаки");
  });
});

describe("leaveBlock", () => {
  it("глава с участниками не выходит", () => {
    expect(leaveBlock(true, 2)).toBe("Сначала передайте главенство");
    expect(leaveBlock(true, 1)).toBeNull();
    expect(leaveBlock(false, 5)).toBeNull();
  });
});

describe("joinBlock", () => {
  it("уже здесь, нет мест, глава другой гильдии с участниками", () => {
    expect(joinBlock({ members: 3, inThis: true, current: { isLeader: false, members: 3 } })).toBe("same");
    expect(joinBlock({ members: 10, inThis: false, current: null })).toBe("full");
    expect(joinBlock({ members: 3, inThis: false, current: { isLeader: true, members: 2 } })).toBe("leader");
    expect(joinBlock({ members: 3, inThis: false, current: { isLeader: true, members: 1 } })).toBeNull();
    expect(joinBlock({ members: 9, inThis: false, current: { isLeader: false, members: 4 } })).toBeNull();
  });
});

describe("значки", () => {
  it("12 значков, проверка кода", () => {
    expect(GUILD_EMBLEMS).toHaveLength(12);
    expect(isEmblem("shield")).toBe(true);
    expect(isEmblem("x")).toBe(false);
  });
});
