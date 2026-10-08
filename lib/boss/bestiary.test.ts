import { describe, expect, it } from "vitest";
import { bestiary } from "@/lib/boss/bestiary";
import { bossForWeek } from "@/lib/boss/bosses";
import { addWeeks } from "@/lib/progress/weekly-streak";

// Понедельник, когда на арене голем
let cur = "2026-10-05";
while (bossForWeek(cur) !== "golem") cur = addWeeks(cur, 1);

describe("bestiary", () => {
  it("без боёв — четыре закрытых босса в порядке ротации", () => {
    const empty = bestiary([], cur);
    expect(empty.map((e) => e.code)).toEqual(["golem", "troll", "dragon", "knight"]);
    expect(empty.every((e) => e.wins === 0 && e.stars === 0 && e.firstWin === null && e.bestDamage === 0)).toBe(true);
    expect(empty.map((e) => e.weeksUntil)).toEqual([0, 1, 2, 3]);
  });

  it("победы, первая победа, лучший урон; урон без победы тоже виден", () => {
    const rows = [
      { week: addWeeks(cur, -4), code: "golem", defeatedAt: new Date("2026-09-01T10:00:00Z"), damage: 2100 },
      { week: addWeeks(cur, -8), code: "golem", defeatedAt: new Date("2026-08-01T10:00:00Z"), damage: 1800 },
      { week: addWeeks(cur, -3), code: "troll", defeatedAt: null, damage: 900 },
    ];
    const [golem, troll] = bestiary(rows, cur);
    expect(golem).toMatchObject({ name: "Железный Голем", wins: 2, stars: 1, firstWin: "2026-08-01T10:00:00.000Z", bestDamage: 2100 });
    expect(troll).toMatchObject({ wins: 0, stars: 0, firstWin: null, bestDamage: 900 });
  });
});
