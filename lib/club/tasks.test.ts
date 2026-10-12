import { describe, expect, it } from "vitest";
import {
  chestBlock,
  chestExpired,
  eligible,
  hitCounts,
  minTarget,
  pickCardTask,
  startDayAllowed,
  taskBlock,
  taskFeedTitle,
  taskSchema,
  taskTitle,
  taskWindow,
  unitText,
  workoutAmount,
} from "./tasks";

const at = (iso: string) => new Date(iso);
const ok = { type: "WORKOUTS", mode: "EACH", target: 8, startDay: "2026-10-12", days: 28 };

describe("minTarget", () => {
  it("на неделю срока, дробно, вверх", () => {
    expect(minTarget("WORKOUTS", "EACH", 28, 1)).toBe(8);
    expect(minTarget("WORKOUTS", "CLUB", 14, 50)).toBe(200);
    expect(minTarget("VOLUME", "EACH", 10, 1)).toBe(7200); // 5000 × 10/7 = 7142,9 → до 100 вверх
    expect(minTarget("HOURS", "EACH", 7, 1)).toBe(120); // минуты
    expect(minTarget("HOURS", "EACH", 10, 1)).toBe(180); // 2 × 10/7 = 2,86 ч → 3 ч
    expect(minTarget("REPS", "CLUB", 7, 3)).toBe(300);
  });
  it("клуб без участников — как один", () => {
    expect(minTarget("WORKOUTS", "CLUB", 7, 0)).toBe(2);
  });
});

describe("taskBlock и схема", () => {
  it("лимит активных и минимум", () => {
    expect(taskBlock({ type: "WORKOUTS", active: 3, target: 999, min: 1 })).toBe("В клубе уже 3 активных задания");
    expect(taskBlock({ type: "WORKOUTS", active: 0, target: 7, min: 8 })).toBe("Минимум для такого задания: 8 тренировок");
    expect(taskBlock({ type: "WORKOUTS", active: 2, target: 8, min: 8 })).toBeNull();
    // Часы хранятся в минутах, но в тексте — часы; объём — с разделителем
    expect(taskBlock({ type: "HOURS", active: 0, target: 600, min: 840 })).toBe("Минимум для такого задания: 14 ч");
    expect(taskBlock({ type: "VOLUME", active: 0, target: 100, min: 7200 })).toBe("Минимум для такого задания: 7 200 кг");
  });
  it("срок 7…31, упражнение для повторов", () => {
    expect(taskSchema.safeParse(ok).success).toBe(true);
    expect(taskSchema.safeParse({ ...ok, days: 6 }).success).toBe(false);
    expect(taskSchema.safeParse({ ...ok, days: 32 }).success).toBe(false);
    expect(taskSchema.safeParse({ ...ok, type: "REPS" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...ok, type: "REPS", exerciseId: "sq" }).success).toBe(true);
  });
  it("старт — сегодня…+14", () => {
    expect(startDayAllowed("2026-10-12", "2026-10-12")).toBe(true);
    expect(startDayAllowed("2026-10-26", "2026-10-12")).toBe(true);
    expect(startDayAllowed("2026-10-27", "2026-10-12")).toBe(false);
    expect(startDayAllowed("2026-10-11", "2026-10-12")).toBe(false);
  });
});

describe("workoutAmount", () => {
  const d = at("2026-10-12T10:00Z");
  const w = {
    totalVolume: 1234.6,
    durationSec: 3599,
    exercises: [
      {
        exerciseId: "sq",
        sets: [
          { reps: 10, isWarmup: true, completedAt: d },
          { reps: 8, isWarmup: false, completedAt: d },
          { reps: 8, isWarmup: false, completedAt: null },
        ],
      },
    ],
  };
  it("разминка и неотмеченные не в счёт", () => {
    expect(workoutAmount("REPS", w, "sq")).toBe(8);
    expect(workoutAmount("REPS", w, "bench")).toBe(0);
  });
  it("объём, минуты, тренировка", () => {
    expect(workoutAmount("VOLUME", w, null)).toBe(1235);
    expect(workoutAmount("HOURS", w, null)).toBe(60);
    expect(workoutAmount("WORKOUTS", w, null)).toBe(1);
  });
  it("забытая тренировка даёт в «часы» не больше 4 ч", () => {
    expect(workoutAmount("HOURS", { ...w, durationSec: 72 * 3600 }, null)).toBe(240);
  });
});

describe("hitCounts", () => {
  const win = { startsAt: at("2026-10-01T00:00Z"), endsAt: at("2026-10-08T00:00Z"), joinedAt: at("2026-09-01T00:00Z"), cancelledAt: null };
  it("офлайн-финиш принимается до 24 ч после окна", () => {
    expect(hitCounts({ ...win, finishedAt: at("2026-10-07T23:00Z"), now: at("2026-10-08T01:00Z") })).toBe(true);
    expect(hitCounts({ ...win, finishedAt: at("2026-10-07T23:00Z"), now: at("2026-10-09T01:00Z") })).toBe(false);
  });
  it("вне окна, до вступления, после отмены — нет", () => {
    expect(hitCounts({ ...win, finishedAt: at("2026-10-08T00:00Z"), now: at("2026-10-08T00:30Z") })).toBe(false);
    expect(hitCounts({ ...win, finishedAt: at("2026-09-30T23:59Z"), now: at("2026-09-30T23:59Z") })).toBe(false);
    expect(hitCounts({ ...win, joinedAt: at("2026-10-05T00:00Z"), finishedAt: at("2026-10-04T10:00Z"), now: at("2026-10-04T10:00Z") })).toBe(false);
    expect(hitCounts({ ...win, cancelledAt: at("2026-10-03T00:00Z"), finishedAt: at("2026-10-04T10:00Z"), now: at("2026-10-04T10:00Z") })).toBe(false);
  });
});

describe("eligible", () => {
  it("1 % цели или хотя бы одна тренировка", () => {
    expect(eligible({ amount: 100, workouts: 0, target: 10000 })).toBe(true);
    expect(eligible({ amount: 99, workouts: 0, target: 10000 })).toBe(false);
    expect(eligible({ amount: 5, workouts: 1, target: 10000 })).toBe(true);
  });
});

describe("тексты", () => {
  it("названия", () => {
    expect(taskTitle({ type: "REPS", mode: "CLUB", target: 10000, days: 30 }, "Приседания со штангой")).toBe(
      "Клубом: 10 000 повторов в «Приседания со штангой» за 30 дней",
    );
    expect(taskTitle({ type: "WORKOUTS", mode: "EACH", target: 12, days: 28 }, null)).toBe("Каждому: 12 тренировок за 28 дней");
    expect(taskTitle({ type: "HOURS", mode: "CLUB", target: 3000, days: 31 }, null)).toBe("Клубом: 50 ч в зале за 31 день");
  });
  it("при скрытых весах объём — без килограммов", () => {
    expect(taskFeedTitle({ type: "VOLUME", mode: "EACH", target: 20000, days: 28 }, null, true)).toBe("задание клуба по объёму");
    expect(taskFeedTitle({ type: "VOLUME", mode: "EACH", target: 20000, days: 28 }, null, false)).toBe("Каждому: 20 000 кг за 28 дней");
    expect(taskFeedTitle({ type: "WORKOUTS", mode: "EACH", target: 2, days: 7 }, null, true)).toBe("Каждому: 2 тренировки за 7 дней");
  });
  it("единицы", () => {
    expect(unitText("WORKOUTS", 1)).toBe("1 тренировка");
    expect(unitText("VOLUME", 10000)).toBe("10 000 кг");
    expect(unitText("REPS", 200)).toBe("200 повторов");
    expect(unitText("HOURS", 90)).toBe("1,5 ч");
  });
});

describe("сундук", () => {
  it("не больше 2 в неделю и 4 недели хранения", () => {
    expect(chestBlock({ openedThisWeek: 2 })).toBe("Откроется с понедельника");
    expect(chestBlock({ openedThisWeek: 1 })).toBeNull();
    expect(chestExpired({ endsAt: at("2026-10-01T00:00Z"), now: at("2026-10-29T00:00:01Z") })).toBe(true);
    expect(chestExpired({ endsAt: at("2026-10-01T00:00Z"), now: at("2026-10-28T23:59Z") })).toBe(false);
  });
});

describe("taskWindow", () => {
  it("полночь дня старта и через N суток в поясе", () => {
    expect(taskWindow("2026-10-12", 7, "Europe/Moscow")).toEqual({ startsAt: at("2026-10-11T21:00Z"), endsAt: at("2026-10-18T21:00Z") });
  });
});

describe("pickCardTask", () => {
  const t = (id: string, o: Partial<{ started: boolean; completed: boolean; endsAt: string }> = {}) => ({
    id,
    started: true,
    completed: false,
    endsAt: "2026-10-20T00:00:00.000Z",
    ...o,
  });
  it("нет заданий — ничего", () => {
    expect(pickCardTask([])).toBeNull();
  });
  it("невыполненное раньше выполненного, затем раньше кончается", () => {
    const done = t("done", { completed: true, endsAt: "2026-10-14T00:00:00.000Z" });
    const late = t("late", { endsAt: "2026-10-30T00:00:00.000Z" });
    const soon = t("soon", { endsAt: "2026-10-18T00:00:00.000Z" });
    expect(pickCardTask([done, late, soon])?.id).toBe("soon");
    expect(pickCardTask([done])?.id).toBe("done");
  });
  it("не начавшееся — только если других нет", () => {
    const future = t("future", { started: false, endsAt: "2026-10-15T00:00:00.000Z" });
    const done = t("done", { completed: true });
    expect(pickCardTask([future, done])?.id).toBe("done");
    expect(pickCardTask([future])?.id).toBe("future");
  });
});
