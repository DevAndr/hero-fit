import { describe, expect, it } from "vitest";
import {
  buildClientRow,
  buildTotals,
  isCoachRecapRow,
  isCoachRecapTotals,
  planPct,
  recapReadyAt,
  recapPushBody,
  sortRecapRows,
  type ClientRecapInput,
  type CoachRecapRow,
  type CoachRecapTotals,
} from "./recap";

type Meta = ClientRecapInput["metas"][number];

const rec = (name: string) => ({ exerciseId: name, exerciseName: name, type: "MAX_WEIGHT", value: 100, previous: 90 }) as Meta["records"][number];
const prog = (exercise: string, kind: "up" | "same" | "deload") => ({ exercise, kind, from: 50, to: 55, fails: 0, bodyweight: false });
const meta = (p: Partial<Meta> = {}): Meta => ({ records: [], ...p });

const input = (p: Partial<ClientRecapInput> = {}): ClientRecapInput => ({
  isNew: false,
  plan: null,
  workouts: 0,
  prevWorkouts: 0,
  metas: [],
  program: null,
  sunday: "2026-10-25",
  signals: [],
  unanswered: 0,
  ...p,
});

const row = (p: Partial<CoachRecapRow> = {}): CoachRecapRow => ({ ...buildClientRow(input()), ...p });

describe("buildClientRow", () => {
  it("план и тренировки", () => {
    const r = buildClientRow(input({ plan: { done: 3, total: 4 }, workouts: 4, prevWorkouts: 3, isNew: true, unanswered: 2 }));
    expect(r.version).toBe(1);
    expect(r.plan).toEqual({ done: 3, total: 4 });
    expect(r.workouts).toBe(4);
    expect(r.prevWorkouts).toBe(3);
    expect(r.isNew).toBe(true);
    expect(r.unanswered).toBe(2);
    expect(buildClientRow(input()).plan).toBeNull();
  });

  it("рекорды: число по всем, до 3 уникальных названий", () => {
    const r = buildClientRow(
      input({
        metas: [meta({ records: [rec("Жим"), rec("Жим"), rec("Присед")] }), meta({ records: [rec("Тяга"), rec("Подтягивания")] })],
      }),
    );
    expect(r.records).toEqual({ count: 5, names: ["Жим", "Присед", "Тяга"] });
  });

  it("прогрессия: own и same не считаются, до 3 + more, ups — полное число", () => {
    const r = buildClientRow(
      input({
        metas: [
          meta({ progression: [prog("A", "up"), prog("B", "up"), prog("C", "up"), prog("D", "up"), prog("E", "deload"), prog("F", "same")] }),
          meta({ progression: [prog("Z", "up")], progressionSource: "own" }),
        ],
      }),
    );
    expect(r.progression.items.length).toBe(3);
    expect(r.progression.more).toBe(2);
    expect(r.progression.ups).toBe(4);
    expect(r.progression.items[0]).toEqual({ exercise: "A", kind: "up", from: 50, to: 55, bodyweight: false });
  });

  it("программа: неделя на воскресенье, следующая — разгрузка, заканчивается", () => {
    const program = { startDate: "2026-10-05", weeks: 8, deloadEvery: 4 };
    expect(buildClientRow(input({ program, sunday: "2026-10-25" })).program).toEqual({ week: 3, weeks: 8, nextDeload: true, ending: false });
    expect(buildClientRow(input({ program, sunday: "2026-11-22" })).program?.ending).toBe(true);
    expect(buildClientRow(input()).program).toBeNull();
  });
});

describe("buildTotals", () => {
  const a = row({ workouts: 3, plan: { done: 2, total: 3 }, records: { count: 2, names: [] }, progression: { items: [], more: 0, ups: 1 }, signals: ["INACTIVE"], unanswered: 1 });
  const b = row({ workouts: 0, plan: { done: 1, total: 2 }, unanswered: 2 });
  const prev: CoachRecapTotals = { version: 1, clients: 2, trained: 2, plan: { done: 3, total: 4 }, prevPlanPct: null, workouts: 5, records: 0, ups: 0, attention: 0, unanswered: 0 };

  it("суммы, trained, attention, prevPlanPct", () => {
    const t = buildTotals([a, b], prev);
    expect(t).toEqual({
      version: 1,
      clients: 2,
      trained: 1,
      plan: { done: 3, total: 5 },
      prevPlanPct: 75,
      workouts: 3,
      records: 2,
      ups: 1,
      attention: 1,
      unanswered: 3,
    });
    expect(buildTotals([a, b], null).prevPlanPct).toBeNull();
    expect(buildTotals([row()], null).plan).toBeNull();
  });
});

describe("sortRecapRows", () => {
  it("сигналы, затем без тренировок, затем рекорды, затем имя", () => {
    const rows = [
      { name: "Яна", row: row({ workouts: 2 }) },
      { name: "Борис", row: row({ workouts: 2, records: { count: 1, names: ["x"] } }) },
      { name: "Вова", row: row({ workouts: 0 }) },
      { name: "Анна", row: row({ workouts: 2, signals: ["INACTIVE"] }) },
      { name: "Гриша", row: row({ workouts: 2, signals: ["INACTIVE", "STALLED"] }) },
      { name: "Алла", row: row({ workouts: 2 }) },
    ];
    expect(sortRecapRows(rows).map((r) => r.name)).toEqual(["Гриша", "Анна", "Вова", "Борис", "Алла", "Яна"]);
  });
});

describe("recapPushBody", () => {
  const t = (p: Partial<CoachRecapTotals>): CoachRecapTotals => ({
    version: 1, clients: 15, trained: 12, plan: null, prevPlanPct: null, workouts: 0, records: 0, ups: 0, attention: 0, unanswered: 0, ...p,
  });
  it("три варианта", () => {
    expect(recapPushBody(t({ plan: { done: 17, total: 20 }, attention: 2 }))).toBe("Неделя клиентов: 12 из 15 тренировались, план 85%. 2 требуют внимания");
    expect(recapPushBody(t({ clients: 4, trained: 3, records: 9 }))).toBe("Неделя клиентов: 3 из 4 тренировались. 9 рекордов");
    expect(recapPushBody(t({ trained: 0 }))).toBe("Неделя клиентов: никто не тренировался — загляните, кому написать");
    expect(recapPushBody(t({ attention: 1 }))).toBe("Неделя клиентов: 12 из 15 тренировались. 1 требует внимания");
    expect(recapPushBody(t({}))).toBe("Неделя клиентов: 12 из 15 тренировались");
  });
  it("planPct округляет", () => {
    expect(planPct({ done: 1, total: 3 })).toBe(33);
  });
});

describe("guards", () => {
  it("isCoachRecapRow / Totals", () => {
    expect(isCoachRecapRow({ version: 2 })).toBe(false);
    expect(isCoachRecapRow(null)).toBe(false);
    expect(isCoachRecapRow(row())).toBe(true);
    expect(isCoachRecapTotals({ version: 2 })).toBe(false);
    expect(isCoachRecapTotals(null)).toBe(false);
    expect(isCoachRecapTotals({ version: 1 })).toBe(true);
  });
});

describe("recapReadyAt", () => {
  it("граница — конец недели самого западного клиента", () => {
    // Тренер UTC+3 (неделя кончается вс 21:00 UTC), клиенты UTC+3 и UTC−5 → пн 05:00 UTC
    expect(recapReadyAt("2026-10-12", ["Etc/GMT-3", "Etc/GMT+5"])?.toISOString()).toBe("2026-10-19T05:00:00.000Z");
    expect(recapReadyAt("2026-10-12", ["Etc/GMT-3"])?.toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });

  it("без клиентов — null", () => {
    expect(recapReadyAt("2026-10-12", [])).toBeNull();
  });
});
