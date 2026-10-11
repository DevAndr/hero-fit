import { describe, expect, it } from "vitest";
import { clientSignals, signalsDiff, signalsNotice, type SignalInput, type SignalKind } from "./signals";

const NOW = new Date("2026-10-11T09:00:00Z"); // 12:00 МСК 11 октября
const TZ = "Europe/Moscow";
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const at = (...days: number[]) => days.map(daysAgo);
const p = (date: string, status: SignalInput["plan"][number]["status"]) => ({ date, status });
const t = (over: Partial<SignalInput["targets"][number]> = {}) => ({ fails: 0, unloadedAt: null, updatedAt: daysAgo(3), ...over });

const input = (over: Partial<SignalInput> = {}): SignalInput => ({
  linkedAt: daysAgo(100),
  lastWorkoutAt: daysAgo(1),
  workoutsAt: [],
  plan: [],
  targets: [],
  ...over,
});
const kinds = (over: Partial<SignalInput> = {}): SignalKind[] => clientSignals(input(over), NOW, TZ).map((s) => s.kind);
const sig = (over: Partial<SignalInput>, kind: SignalKind) => clientSignals(input(over), NOW, TZ).find((s) => s.kind === kind)!;

describe("MISSED_PLAN", () => {
  it("две последние прошедшие назначенные не выполнены", () => {
    expect(kinds({ plan: [p("2026-10-08", "missed"), p("2026-10-10", "skipped")] })).toContain("MISSED_PLAN");
    expect(kinds({ plan: [p("2026-10-08", "missed"), p("2026-10-10", "done")] })).not.toContain("MISSED_PLAN");
    expect(kinds({ plan: [p("2026-10-10", "missed")] })).not.toContain("MISSED_PLAN");
  });

  it("сегодняшнее назначение — не пропуск", () => {
    expect(kinds({ plan: [p("2026-10-08", "missed"), p("2026-10-11", "today")] })).not.toContain("MISSED_PLAN");
  });

  it("since — полночь более раннего пропуска в поясе клиента", () => {
    expect(sig({ plan: [p("2026-10-06", "missed"), p("2026-10-08", "missed")] }, "MISSED_PLAN").since).toEqual(new Date("2026-10-05T21:00:00Z"));
  });
});

describe("INACTIVE", () => {
  it("7 дней без тренировок; без тренировок — от связи", () => {
    expect(kinds({ lastWorkoutAt: daysAgo(7) })).toContain("INACTIVE");
    expect(kinds({ lastWorkoutAt: daysAgo(6) })).not.toContain("INACTIVE");
    expect(kinds({ lastWorkoutAt: null, linkedAt: daysAgo(1) })).toEqual([]);
    expect(kinds({ lastWorkoutAt: null, linkedAt: daysAgo(8) })).toEqual(["INACTIVE"]);
  });
});

describe("STALLED", () => {
  it("2 неудачи подряд или разгрузка за 14 дней", () => {
    expect(kinds({ targets: [t({ fails: 2 })] })).toContain("STALLED");
    expect(kinds({ targets: [t({ fails: 1 })] })).not.toContain("STALLED");
    expect(kinds({ targets: [t({ unloadedAt: daysAgo(14) })] })).toContain("STALLED");
    expect(kinds({ targets: [t({ unloadedAt: daysAgo(15) })] })).not.toContain("STALLED");
  });
});

describe("ACTIVITY_DROP", () => {
  it("за 14 дней не больше половины обычного (среднее за 2 недели ≥ 2)", () => {
    expect(kinds({ workoutsAt: [...at(20, 25, 30, 35), ...at(3)] })).toContain("ACTIVITY_DROP");
    expect(kinds({ workoutsAt: [...at(20, 25, 30), ...at(3)] })).not.toContain("ACTIVITY_DROP");
    expect(kinds({ workoutsAt: [...at(20, 25, 30, 35), ...at(3, 5)] })).not.toContain("ACTIVITY_DROP");
  });

  it("связь моложе 42 дней — не считается", () => {
    expect(kinds({ linkedAt: daysAgo(41), workoutsAt: [...at(20, 25, 30, 35), ...at(3)] })).not.toContain("ACTIVITY_DROP");
  });

  it("неактивность гасит спад", () => {
    expect(kinds({ lastWorkoutAt: daysAgo(10), workoutsAt: at(20, 25, 30, 35, 10) })).toEqual(["INACTIVE"]);
  });
});

describe("signalsDiff", () => {
  it("новые — открыть, пропавшие — закрыть", () => {
    expect(signalsDiff(["STALLED", "INACTIVE"], ["INACTIVE", "MISSED_PLAN"])).toEqual({ open: ["MISSED_PLAN"], resolve: ["STALLED"] });
  });
});

describe("signalsNotice", () => {
  it("имя и фразы через точку", () => {
    expect(signalsNotice("Маша", ["MISSED_PLAN", "ACTIVITY_DROP"])).toBe("Маша: пропущены 2 тренировки подряд · спад активности");
  });
});
