import { describe, expect, it } from "vitest";
import type { GroupRecovery } from "@/lib/progress/recovery";
import {
  baseline,
  recoveryZone,
  todaySleep,
  whoopAdvice,
  yesterdaySleep,
  zoneShort,
  zoneText,
  type SleepNight,
} from "./recovery";

const H = 3600_000;

function night(over: Partial<SleepNight> = {}): SleepNight {
  return {
    end: new Date("2026-10-19T06:00:00Z"),
    sleepScoreState: "SCORED",
    sleepMs: 8 * H,
    needMs: 8 * H,
    performancePct: 80,
    recoveryScoreState: "SCORED",
    recoveryPct: 50,
    restingHr: 54,
    hrvMs: 50,
    calibrating: false,
    ...over,
  };
}

const base = { hrvMs: 50, restingHr: 54 };
const legs = (state: GroupRecovery["state"]): GroupRecovery => ({
  group: "LEGS",
  state,
  percent: 30,
  hoursLeft: 20,
  daysSince: 1,
});

describe("recoveryZone", () => {
  it("делит на зоны", () => {
    expect(recoveryZone(67)).toBe("green");
    expect(recoveryZone(66)).toBe("yellow");
    expect(recoveryZone(34)).toBe("yellow");
    expect(recoveryZone(33)).toBe("red");
    expect(recoveryZone(null)).toBeNull();
  });
});

describe("todaySleep / yesterdaySleep", () => {
  const s = night({ end: new Date("2026-10-19T21:30:00Z") });
  const now = new Date("2026-10-19T22:00:00Z");
  it("учитывает пояс", () => {
    expect(todaySleep([s], now, "Etc/GMT-10")).toBe(s);
    expect(todaySleep([s], now, "America/Los_Angeles")).toBe(s);
    // в Лос-Анджелесе now = 19-е 15:00, сон 19-го 14:30 — сегодня; в GMT-10 сон 20-го
    expect(yesterdaySleep([s], now, "Etc/GMT-10")).toBeNull();
    expect(yesterdaySleep([s], new Date("2026-10-20T22:00:00Z"), "Etc/GMT-10")).toBe(s);
  });
  it("не берёт сон из будущего", () => {
    expect(todaySleep([s], new Date("2026-10-19T21:00:00Z"), "UTC")).toBeNull();
  });
  it("из двух берёт с большим end", () => {
    const a = night({ end: new Date("2026-10-19T05:00:00Z") });
    const b = night({ end: new Date("2026-10-19T09:00:00Z") });
    expect(todaySleep([b, a], new Date("2026-10-19T12:00:00Z"), "UTC")).toBe(b);
  });
});

describe("baseline", () => {
  const today = night({ end: new Date("2026-10-19T06:00:00Z") });
  const prev = (i: number, over: Partial<SleepNight> = {}) =>
    night({ end: new Date(Date.UTC(2026, 9, 19 - i, 6)), ...over });
  it("меньше 4 ночей — null", () => {
    expect(baseline([prev(1), prev(2), prev(3)], today)).toBeNull();
  });
  it("берёт 7 последних до today, только SCORED", () => {
    const nights = [
      today,
      prev(1, { hrvMs: 10, restingHr: 10, recoveryScoreState: "PENDING_SCORE" }),
      ...[2, 3, 4, 5, 6, 7, 8].map((i) => prev(i, { hrvMs: 60, restingHr: 50 })),
      prev(9, { hrvMs: 1000, restingHr: 100 }),
    ];
    expect(baseline(nights, today)).toEqual({ hrvMs: 60, restingHr: 50 });
  });
  it("усредняет", () => {
    const nights = [prev(1, { hrvMs: 40, restingHr: 50 }), prev(2, { hrvMs: 60, restingHr: 60 }), prev(3), prev(4)];
    const r = baseline(nights, today)!;
    expect(r.hrvMs).toBeCloseTo((40 + 60 + 50 + 50) / 4);
    expect(r.restingHr).toBeCloseTo((50 + 60 + 54 + 54) / 4);
  });
});

describe("zoneText", () => {
  it("тексты зон", () => {
    expect(zoneText("green")).toContain("можно тяжёлую тренировку");
    expect(zoneText("yellow")).toContain("держи текущие веса");
    expect(zoneText("red")).toContain("−10 % веса");
  });
});

describe("zoneShort", () => {
  it("короткие тексты зон для строки тренировки", () => {
    expect(zoneShort("green")).toBe("можно тяжело");
    expect(zoneShort("yellow")).toBe("держи текущие веса");
    expect(zoneShort("red")).toBe("лёгкий день");
  });
});

describe("whoopAdvice", () => {
  const run = (today: Partial<SleepNight>, o: { yesterday?: SleepNight | null; base?: typeof base | null; muscles?: GroupRecovery[] } = {}) =>
    whoopAdvice({
      today: night(today),
      yesterday: o.yesterday ?? null,
      base: o.base === undefined ? base : o.base,
      muscles: o.muscles ?? [],
    });
  const ids = (a: { id: string }[]) => a.map((x) => x.id);

  it("недосып", () => {
    const a = run({ sleepMs: 5 * H, needMs: 8 * H }).find((x) => x.id === "sleep")!;
    expect(a.tone).toBe("warn");
    expect(a.text).toContain("Недоспал 3 ч");
  });
  it("второй день недосыпа", () => {
    const y = night({ sleepMs: 5 * H, needMs: 8 * H });
    const a = run({ sleepMs: 5 * H, needMs: 8 * H }, { yesterday: y }).find((x) => x.id === "sleep")!;
    expect(a.text).toContain("Второй день недосыпа — лучше лечь пораньше");
  });
  it("HRV", () => {
    expect(ids(run({ hrvMs: 40 }))).toContain("hrv");
    expect(ids(run({ hrvMs: 43 }))).not.toContain("hrv");
  });
  it("пульс", () => {
    const a = run({ restingHr: 60 }).find((x) => x.id === "rhr")!;
    expect(a.text).toContain("на 6");
    expect(ids(run({ restingHr: 58 }))).not.toContain("rhr");
  });
  it("калибровка или нет базы", () => {
    expect(ids(run({ calibrating: true, hrvMs: 10, restingHr: 90 }))).not.toEqual(expect.arrayContaining(["hrv"]));
    expect(ids(run({ calibrating: true, hrvMs: 10, restingHr: 90 }))).not.toContain("rhr");
    expect(ids(run({ hrvMs: 10, restingHr: 90 }, { base: null }))).not.toEqual(expect.arrayContaining(["hrv", "rhr"]));
    expect(ids(run({ hrvMs: 10, restingHr: 90 }, { base: null }))).toEqual([]);
  });
  it("мышцы", () => {
    const a = run({ recoveryPct: 50 }, { muscles: [legs("fatigued")] }).find((x) => x.id === "muscles")!;
    expect(a.text).toContain("Ноги");
    expect(ids(run({ recoveryPct: 80 }, { muscles: [legs("fatigued")] }))).not.toContain("muscles");
  });
  it("несколько групп через запятую", () => {
    const back: GroupRecovery = { ...legs("fatigued"), group: "BACK" };
    const a = run({ recoveryPct: 20 }, { muscles: [legs("fatigued"), back] }).find((x) => x.id === "muscles")!;
    expect(a.text).toContain("Ноги, спина ещё восстанавливаются");
  });
  it("глагол по числу", () => {
    const text = (g: GroupRecovery["group"], extra: GroupRecovery[] = []) =>
      run({ recoveryPct: 50 }, { muscles: [{ ...legs("fatigued"), group: g }, ...extra] }).find((x) => x.id === "muscles")!.text;
    expect(text("BACK")).toContain("Спина ещё восстанавливается");
    expect(text("ABS")).toContain("Пресс ещё восстанавливается");
    expect(text("LEGS")).toContain("Ноги ещё восстанавливаются");
    expect(text("BACK", [{ ...legs("fatigued"), group: "ABS" }])).toContain("Спина, пресс ещё восстанавливаются");
  });
  it("хороший день", () => {
    const a = run({ recoveryPct: 80, performancePct: 92, hrvMs: 55 });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ id: "good-day", tone: "good", href: "/training" });
    expect(ids(run({ recoveryPct: 80, performancePct: 92, hrvMs: 55, restingHr: 60 }))).not.toContain("good-day");
  });
  it("порядок", () => {
    const a = run({ restingHr: 60, hrvMs: 40, sleepMs: 5 * H, needMs: 8 * H });
    expect(ids(a)).toEqual(["rhr", "hrv", "sleep"]);
  });
});
