import { describe, expect, it } from "vitest";
import { bestiary } from "@/lib/boss/bestiary";
import { BOSSES, bossForWeek } from "@/lib/boss/bosses";
import { addWeeks } from "@/lib/progress/weekly-streak";

// Понедельник, когда на арене голем
let cur = "2026-10-05";
while (bossForWeek(cur) !== "golem") cur = addWeeks(cur, 1);

describe("bestiary", () => {
  it("без боёв — все боссы закрыты в порядке ротации", () => {
    const empty = bestiary([], cur);
    expect(empty.map((e) => e.code)).toEqual(BOSSES.map((b) => b.code));
    expect(empty.slice(0, 4).map((e) => e.code)).toEqual(["golem", "troll", "dragon", "knight"]);
    expect(empty.every((e) => e.wins === 0 && e.stars === 0 && e.firstWin === null && e.bestDamage === 0)).toBe(true);
    expect(empty.map((e) => e.weeksUntil)).toEqual(BOSSES.map((_, i) => i));
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

  it("история боёв: от новых к старым, без пустых недель, текущая отмечена", () => {
    const rows = [
      { week: addWeeks(cur, -12), code: "golem", defeatedAt: new Date("2026-07-01T10:00:00Z"), damage: 1600 },
      { week: cur, code: "golem", defeatedAt: null, damage: 300 },
      { week: addWeeks(cur, -24), code: "golem", defeatedAt: null, damage: 0 },
      { week: addWeeks(cur, -36), code: "golem", defeatedAt: null, damage: 700 },
    ];
    const [golem] = bestiary(rows, cur);
    expect(golem.history).toEqual([
      { week: cur, damage: 300, won: false, current: true },
      { week: addWeeks(cur, -12), damage: 1600, won: true, current: false },
      { week: addWeeks(cur, -36), damage: 700, won: false, current: false },
    ]);
  });

  it("история — не больше 10 недель", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ week: addWeeks(cur, -12 * (i + 1)), code: "golem", defeatedAt: null, damage: 100 + i }));
    expect(bestiary(rows, cur)[0].history.map((h) => h.damage)).toEqual(Array.from({ length: 10 }, (_, i) => 100 + i));
  });
});
