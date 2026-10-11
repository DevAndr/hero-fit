import { describe, expect, it } from "vitest";
import { BOSSES } from "@/lib/boss/bosses";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";
import type { BossWins } from "@/lib/titles/catalog";
import { availableTitles, bossStars, bossTitles, titleForAchievement, titleLabel, titlesUnlockedByWin } from "@/lib/titles/catalog";

const labels = (bossWins: BossWins) => availableTitles({ achievementCodes: [], bossWins }).map((t) => t.label);
const codes = (titles: { code: string }[]) => titles.map((t) => t.code);

describe("bossStars", () => {
  it("1 / 3 / 10 побед — 1 / 2 / 3 звезды", () => {
    expect([0, 1, 2, 3, 9, 10, 25].map(bossStars)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("availableTitles", () => {
  it("пусто без побед и ачивок", () => {
    expect(availableTitles({ achievementCodes: [], bossWins: {} })).toEqual([]);
  });

  it("титулы босса по звёздам", () => {
    expect(labels({ golem: 3 })).toEqual(["Гроза Голема", "Кошмар Голема"]);
  });

  it("«Легенда бестиария» — только при победе над всеми боссами", () => {
    const all = Object.fromEntries(BOSSES.map((b) => [b.code, 1]));
    expect(labels({ ...all, void: 0 })).not.toContain("Легенда бестиария");
    expect(labels(all)).toContain("Легенда бестиария");
  });

  it("порядок: боссы, легенда, ачивки по каталогу", () => {
    expect(codes(availableTitles({ achievementCodes: ["login:100", "streakw:12"], bossWins: { troll: 10, golem: 1 } }))).toEqual([
      "boss:golem:1",
      "boss:troll:1",
      "boss:troll:2",
      "boss:troll:3",
      "ach:streakw:12",
      "ach:login:100",
    ]);
  });

  it("ачивка без титула ничего не даёт", () => {
    expect(availableTitles({ achievementCodes: ["streakw:8"], bossWins: {} })).toEqual([]);
  });
});

describe("titleForAchievement / titleLabel", () => {
  it("вершины лестниц", () => {
    expect(titleForAchievement(`allgroups:${MUSCLE_GROUPS.length}`)?.label).toBe("Без слабых мест");
    expect(titleForAchievement("workouts:95")).toBeNull();
  });

  it("название по коду; неизвестный и пустой — null", () => {
    expect(titleLabel("boss:dragon:3")).toBe("Драконья чешуя");
    expect(titleLabel("legend")).toBe("Легенда бестиария");
    expect(titleLabel("ach:level:25")).toBe("Титан");
    expect(titleLabel("boss:hydra:1")).toBeNull();
    expect(titleLabel(null)).toBeNull();
  });
});

describe("titlesUnlockedByWin", () => {
  it("открывает на порогах 1, 3, 10", () => {
    expect(codes(titlesUnlockedByWin({}, "golem"))).toEqual(["boss:golem:1"]);
    expect(codes(titlesUnlockedByWin({ golem: 2 }, "golem"))).toEqual(["boss:golem:2"]);
    expect(codes(titlesUnlockedByWin({ golem: 9 }, "golem"))).toEqual(["boss:golem:3"]);
  });

  it("между порогами — ничего", () => {
    expect(titlesUnlockedByWin({ golem: 1 }, "golem")).toEqual([]);
    expect(titlesUnlockedByWin({ golem: 3 }, "golem")).toEqual([]);
  });

  it("последняя недостающая первая звезда открывает легенду", () => {
    const others = Object.fromEntries(BOSSES.filter((b) => b.code !== "knight").map((b) => [b.code, 2]));
    expect(codes(titlesUnlockedByWin(others, "knight"))).toEqual(["boss:knight:1", "legend"]);
    expect(codes(titlesUnlockedByWin({ golem: 4, troll: 1, dragon: 2 }, "knight"))).toEqual(["boss:knight:1"]);
  });
});

describe("bossTitles", () => {
  it("три титула босса с порогами", () => {
    expect(bossTitles("knight").map((t) => [t.label, t.wins])).toEqual([
      ["Гроза Рыцаря", 1],
      ["Кошмар Рыцаря", 3],
      ["Тень среди теней", 10],
    ]);
  });
});

describe("raid titles", () => {
  it("вершины рейдовых лестниц", () => {
    expect(titleLabel("ach:raid:25")).toBe("Гроза рейдов");
    expect(titleLabel("ach:raidmvp:10")).toBe("Сердце гильдии");
    expect(availableTitles({ achievementCodes: ["raid:25"], bossWins: {} }).map((t) => t.code)).toContain("ach:raid:25");
  });
});

describe("goal titles", () => {
  it("вершина лестницы целей", () => {
    expect(titleLabel("ach:goal:25")).toBe("Человек слова");
    expect(availableTitles({ achievementCodes: ["goal:25"], bossWins: {} }).map((t) => t.code)).toContain("ach:goal:25");
  });
});
