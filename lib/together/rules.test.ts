import { describe, expect, it } from "vitest";
import {
  bonusEligible,
  bonusXp,
  canCheer,
  inviteExpiresAt,
  overlapMinutes,
  partnerSnapshot,
  sessionState,
  type BonusInput,
} from "./rules";

const at = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00Z`);
const MIN = 60_000;

describe("sessionState", () => {
  const now = at("12:00");
  it("приглашение живёт 15 минут", () => {
    expect(sessionState({ status: "INVITED", createdAt: new Date(now.getTime() - 15 * MIN + 1000), acceptedAt: null }, now)).toBe("INVITED");
    expect(sessionState({ status: "INVITED", createdAt: new Date(now.getTime() - 15 * MIN), acceptedAt: null }, now)).toBe("EXPIRED");
    expect(inviteExpiresAt(at("11:00")).toISOString()).toBe(at("11:15").toISOString());
  });
  it("сессия кончается через 4 часа после принятия", () => {
    expect(sessionState({ status: "ACTIVE", createdAt: at("07:00"), acceptedAt: new Date(now.getTime() - 239 * MIN) }, now)).toBe("ACTIVE");
    expect(sessionState({ status: "ACTIVE", createdAt: at("07:00"), acceptedAt: new Date(now.getTime() - 240 * MIN) }, now)).toBe("ENDED");
  });
  it("конечные статусы — как есть", () => {
    expect(sessionState({ status: "ENDED", createdAt: at("11:59"), acceptedAt: null }, now)).toBe("ENDED");
    expect(sessionState({ status: "DECLINED", createdAt: at("11:59"), acceptedAt: null }, now)).toBe("DECLINED");
  });
});

describe("overlapMinutes", () => {
  it("пересечение в минутах", () => {
    expect(overlapMinutes({ startedAt: at("10:00"), finishedAt: at("11:00") }, { startedAt: at("10:40"), finishedAt: at("12:00") })).toBe(20);
  });
  it("не пересекаются — 0", () => {
    expect(overlapMinutes({ startedAt: at("10:00"), finishedAt: at("11:00") }, { startedAt: at("11:30"), finishedAt: at("12:00") })).toBe(0);
  });
});

describe("bonusEligible", () => {
  const w = (start: string, end: string, sets = 5): BonusInput => ({ status: "COMPLETED", startedAt: at(start), finishedAt: at(end), totalSets: sets });
  it("пересечение 20 минут — бонус, 19 — нет", () => {
    expect(bonusEligible(w("10:00", "11:00"), w("10:40", "12:00"), false)).toBe(true);
    expect(bonusEligible(w("10:00", "11:00"), w("10:41", "12:00"), false)).toBe("short_overlap");
  });
  it("партнёр не закончил или вышел", () => {
    expect(bonusEligible(w("10:00", "11:00"), { ...w("10:00", "11:00"), status: "IN_PROGRESS", finishedAt: null }, false)).toBe("not_finished");
    expect(bonusEligible(w("10:00", "11:00"), { status: null, startedAt: null, finishedAt: null, totalSets: 0 }, false)).toBe("not_finished");
  });
  it("без подходов", () => {
    expect(bonusEligible(w("10:00", "11:00", 0), w("10:00", "11:00"), false)).toBe("no_sets");
    expect(bonusEligible(w("10:00", "11:00"), w("10:00", "11:00", 0), false)).toBe("no_sets");
  });
  it("бонус сегодня уже был", () => {
    expect(bonusEligible(w("10:00", "11:00"), w("10:00", "11:00"), true)).toBe("already_today");
  });
});

describe("bonusXp", () => {
  it("10 % XP тренировки, минимум 5", () => {
    expect(bonusXp(30)).toBe(5);
    expect(bonusXp(120)).toBe(12);
    expect(bonusXp(0)).toBe(5);
  });
});

describe("partnerSnapshot", () => {
  const exercises = [
    { name: "Присед", exerciseId: "sq", sets: [{ reps: 5, weight: 100, done: true }, { reps: 5, weight: 100, done: true }] },
    {
      name: "Жим лёжа",
      exerciseId: "bp",
      sets: [
        { reps: 8, weight: 60, done: true },
        { reps: 8, weight: 60, done: true },
        { reps: 8, weight: 60, done: true },
        { reps: 8, weight: 60, done: false },
        { reps: 8, weight: 60, done: false },
      ],
    },
    { name: "Тяга", exerciseId: "dl", sets: [{ reps: 5, weight: 120, done: false }] },
  ];
  const bests = new Map([["sq", 90], ["bp", 70]]);

  it("рекорд — подход тяжелее прошлого лучшего; текущее — первое незаконченное после последнего выполненного", () => {
    const s = partnerSnapshot(exercises, bests, false);
    expect(s.exercises.map((e) => e.record)).toEqual([true, false, false]);
    expect(s.current).toEqual({ exercise: "Жим лёжа", doneSets: 3, totalSets: 5 });
    expect(s.exercises[0].sets[0]).toEqual({ reps: 5, weight: 100, done: true });
  });
  it("скрытые веса не попадают в срез, значок рекорда остаётся", () => {
    const s = partnerSnapshot(exercises, bests, true);
    expect(s.exercises.flatMap((e) => e.sets).every((x) => x.weight === null)).toBe(true);
    expect(s.exercises[0].record).toBe(true);
    expect(JSON.stringify(s)).not.toContain("100");
  });
  it("первое в жизни упражнение — без рекорда", () => {
    expect(partnerSnapshot([{ name: "Тяга", exerciseId: "dl", sets: [{ reps: 5, weight: 120, done: true }] }], bests, false).exercises[0].record).toBe(false);
  });
  it("всё выполнено — текущего нет", () => {
    expect(partnerSnapshot([exercises[0]], bests, false).current).toBeNull();
  });
});

describe("canCheer", () => {
  const now = at("12:00");
  it("не чаще раза в 10 секунд", () => {
    expect(canCheer(null, now)).toBe(true);
    expect(canCheer(new Date(now.getTime() - 9_999), now)).toBe(false);
    expect(canCheer(new Date(now.getTime() - 10_000), now)).toBe(true);
  });
});
