import { describe, expect, it } from "vitest";
import {
  FRIEND_CODE_LENGTH,
  generateFriendCode,
  nicknameKey,
  nicknameSchema,
  normalizeFriendCode,
  percentile,
  rankLeague,
  type LeagueMember,
} from "./league";

describe("nickname", () => {
  it("accepts letters (incl. Cyrillic), digits and _ . -", () => {
    expect(nicknameSchema.safeParse("Железный_Иван").success).toBe(true);
    expect(nicknameSchema.safeParse("  iron.man-2  ").data).toBe("iron.man-2");
  });

  it("rejects too short, too long and spaces / symbols", () => {
    expect(nicknameSchema.safeParse("ab").success).toBe(false);
    expect(nicknameSchema.safeParse("a".repeat(21)).success).toBe(false);
    expect(nicknameSchema.safeParse("два слова").success).toBe(false);
    expect(nicknameSchema.safeParse("<script>").success).toBe(false);
  });

  it("key is case-insensitive", () => {
    expect(nicknameKey(" ЖелезныЙ ")).toBe(nicknameKey("железный"));
  });
});

describe("friend code", () => {
  it("generates codes from an unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateFriendCode();
      expect(code).toHaveLength(FRIEND_CODE_LENGTH);
      expect(code).not.toMatch(/[01OIL]/);
      expect(normalizeFriendCode(code)).toBe(code);
    }
  });

  it("normalizes user input and rejects garbage", () => {
    expect(normalizeFriendCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeFriendCode(" ab cd ef gh ")).toBe("ABCDEFGH");
    expect(normalizeFriendCode("ABCDEFG")).toBeNull();
    expect(normalizeFriendCode("ABCDEFG0")).toBeNull();
  });
});

const m = (id: string, xp: number, workouts = 1): LeagueMember => ({ id, nickname: id, level: 1, streak: 0, xp, workouts });

describe("rankLeague", () => {
  it("orders by XP, then workouts; ties share a place", () => {
    const ranked = rankLeague([m("c", 100, 1), m("a", 300, 2), m("b", 100, 1), m("d", 100, 3)], "b");
    expect(ranked.map((r) => [r.id, r.place])).toEqual([
      ["a", 1],
      ["d", 2],
      ["b", 3],
      ["c", 3],
    ]);
    expect(ranked.find((r) => r.me)?.id).toBe("b");
  });
});

describe("percentile", () => {
  it("share of others strictly below me", () => {
    expect(percentile(5, 9)).toBe(56);
    expect(percentile(0, 9)).toBe(0);
    expect(percentile(9, 9)).toBe(100);
  });

  it("null when too few athletes", () => {
    expect(percentile(2, 3)).toBeNull();
  });
});
