import { describe, expect, it } from "vitest";
import { BOSSES, bossForWeek, bossLore, bossName, SEASONAL_BOSSES, seasonalBossForWeek, weekBossCode } from "./bosses";

describe("bossForWeek", () => {
  it("по кругу по номеру недели", () => {
    expect(bossForWeek("2024-01-01")).toBe("golem");
    expect(bossForWeek("2024-01-08")).toBe("troll");
    expect(bossForWeek("2024-03-18")).toBe("void");
    expect(bossForWeek("2024-03-25")).toBe("golem");
  });
});

describe("bossName", () => {
  it("имя по коду, неизвестный — «Босс»", () => {
    expect(bossName("dragon")).toBe("Огненный Дракон");
    expect(bossName("x")).toBe("Босс");
  });

  it("знает сезонных боссов", () => {
    expect(bossName("grinch")).toBe("Гринч");
    expect(bossLore("grinch")).toBe("Крадёт не подарки, а декабрьские тренировки. Отступает перед теми, кто не бросил зал под Новый год.");
  });
});

describe("seasonalBossForWeek", () => {
  it("Гринч — в неделю, где 31 декабря", () => {
    expect(seasonalBossForWeek("2026-12-28")).toBe("grinch");
    expect(seasonalBossForWeek("2027-12-27")).toBe("grinch");
    // 31 декабря — понедельник
    expect(seasonalBossForWeek("2029-12-31")).toBe("grinch");
  });

  it("соседние недели — без сезонного босса", () => {
    expect(seasonalBossForWeek("2026-12-21")).toBeNull();
    expect(seasonalBossForWeek("2027-01-04")).toBeNull();
    expect(seasonalBossForWeek("2029-12-24")).toBeNull();
    expect(seasonalBossForWeek("2026-10-05")).toBeNull();
  });

  it("сезонные — отдельно от ротации", () => {
    const rotation = new Set<string>(BOSSES.map((b) => b.code));
    expect(SEASONAL_BOSSES.map((b) => b.code).filter((c) => rotation.has(c))).toEqual([]);
    expect(BOSSES).toHaveLength(12);
  });

  it("weekBossCode: сезонный только с флагом и только в его неделю", () => {
    expect(weekBossCode("2026-12-28", true)).toBe("grinch");
    expect(weekBossCode("2026-12-28", false)).toBe(bossForWeek("2026-12-28"));
    expect(weekBossCode("2027-01-04", true)).toBe(bossForWeek("2027-01-04"));
  });

  it("ротация не сдвигается вокруг Нового года", () => {
    // 2026-12-28 по ротации — тот же босс, что и без сезона; следующая неделя — следующий по кругу
    const i = BOSSES.findIndex((b) => b.code === bossForWeek("2026-12-28"));
    expect(bossForWeek("2027-01-04")).toBe(BOSSES[(i + 1) % BOSSES.length].code);
  });
});
