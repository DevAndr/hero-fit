import { describe, expect, it } from "vitest";
import { STRETCH_SEED } from "./seed-data";
import {
  COURSE_SKILLS,
  courseStartSchema,
  isCourseSkill,
  courseAdvance,
  courseReminderBody,
  shouldRemindCourse,
  isMeasureSession,
  nextHoldSec,
  sessionPlan,
  sessionTitle,
  stageOf,
} from "./course";

const names = (skill: Parameters<typeof sessionPlan>[0], n: number) =>
  sessionPlan(skill, n).map((e) => e.name);

describe("stageOf", () => {
  it.each([
    [1, 1], [6, 1], [7, 2], [12, 2], [13, 3], [19, 4], [24, 4], [25, 5], [30, 5], [31, 5], [100, 5],
  ])("занятие %i — этап %i", (n, stage) => {
    expect(stageOf(n)).toBe(stage);
  });
});

describe("isMeasureSession", () => {
  it("замер на 1, 7, 13, 19, 25, 30", () => {
    for (const n of [1, 7, 13, 19, 25, 30]) expect(isMeasureSession(n)).toBe(true);
    for (const n of [2, 6, 31]) expect(isMeasureSession(n)).toBe(false);
  });
});

describe("isCourseSkill", () => {
  it("только три шпагата", () => {
    expect(isCourseSkill("SPLIT_SIDE")).toBe(true);
    expect(isCourseSkill("BRIDGE")).toBe(false);
  });
});

describe("sessionPlan продольный", () => {
  it("занятие 1", () => {
    const plan = sessionPlan("SPLIT_LEFT", 1);
    expect(plan).toHaveLength(5);
    expect(plan.every((e) => e.sets === 2 && e.holdSec === 30)).toBe(true);
    expect(plan.map((e) => e.name)).toEqual([
      "Выпад на сгибатели бедра",
      "Голубь",
      "Растяжка задней поверхности бедра лёжа",
      "Растяжка квадрицепса лёжа на боку",
      "Складка сидя",
    ]);
  });

  it("занятие 7 — ящерица и полушпагат, 45 с", () => {
    const plan = sessionPlan("SPLIT_LEFT", 7);
    expect(plan.map((e) => e.name)).toEqual(expect.arrayContaining(["Ящерица", "Полушпагат"]));
    expect(plan.every((e) => e.holdSec === 45 && e.sets === 2)).toBe(true);
  });

  it("занятие 13 — 3 подхода, квадрицепс стоя", () => {
    const plan = sessionPlan("SPLIT_LEFT", 13);
    expect(plan.every((e) => e.sets === 3)).toBe(true);
    expect(plan.map((e) => e.name)).toContain("Растяжка квадрицепса стоя");
    expect(plan.map((e) => e.name)).not.toContain("Растяжка квадрицепса лёжа на боку");
  });

  it("шпагат с опорой: 60 с на 19, 90 с на 25", () => {
    for (const skill of ["SPLIT_LEFT", "SPLIT_RIGHT"] as const) {
      const p19 = sessionPlan(skill, 19).find((e) => e.name === "Продольный шпагат с опорой");
      expect(p19?.holdSec).toBe(60);
      const p25 = sessionPlan(skill, 25);
      expect(p25.find((e) => e.name === "Продольный шпагат с опорой")?.holdSec).toBe(90);
      expect(p25.filter((e) => e.name !== "Продольный шпагат с опорой").every((e) => e.holdSec === 60)).toBe(true);
    }
    const side = sessionPlan("SPLIT_SIDE", 19).find((e) => e.name === "Поперечный шпагат с опорой");
    expect(side?.holdSec).toBe(60);
    expect(sessionPlan("SPLIT_SIDE", 25).find((e) => e.name === "Поперечный шпагат с опорой")?.holdSec).toBe(90);
  });

  it("левая и правая ноги — один план", () => {
    for (let n = 1; n <= 30; n++) {
      expect(sessionPlan("SPLIT_LEFT", n)).toEqual(sessionPlan("SPLIT_RIGHT", n));
    }
  });
});

describe("sessionPlan поперечный", () => {
  it("занятие 1", () => {
    expect(names("SPLIT_SIDE", 1)).toEqual([
      "Бабочка",
      "Лягушка",
      "Широкая складка сидя",
      "Растяжка задней поверхности бедра лёжа",
    ]);
  });
  it("занятие 7 — боковой выпад и ящерица", () => {
    expect(names("SPLIT_SIDE", 7)).toEqual(
      expect.arrayContaining(["Боковой выпад", "Ящерица"]),
    );
  });
});

describe("sessionPlan общее", () => {
  it("поддержка = занятие 30", () => {
    for (const skill of COURSE_SKILLS) {
      expect(sessionPlan(skill, 31)).toEqual(sessionPlan(skill, 30));
    }
  });

  it("все упражнения есть в STRETCH_SEED", () => {
    const seed = new Set(STRETCH_SEED.map((e) => e.name));
    for (const skill of COURSE_SKILLS) {
      for (let n = 1; n <= 30; n++) {
        for (const name of names(skill, n)) expect(seed.has(name)).toBe(true);
      }
    }
  });
});

describe("sessionTitle", () => {
  it("название занятия и поддержки", () => {
    expect(sessionTitle(8)).toBe("Шпагат · занятие 8");
    expect(sessionTitle(31)).toBe("Шпагат · поддержка");
  });
});

describe("nextHoldSec", () => {
  it("максимальное удержание занятия", () => {
    expect(nextHoldSec("SPLIT_LEFT", 1)).toBe(30);
    expect(nextHoldSec("SPLIT_LEFT", 7)).toBe(45);
    expect(nextHoldSec("SPLIT_SIDE", 19)).toBe(60);
    expect(nextHoldSec("SPLIT_SIDE", 25)).toBe(90);
  });
});

describe("courseStartSchema", () => {
  const ok = { skill: "SPLIT_SIDE", remindDays: [0, 2, 4], cm: 25 };

  it("принимает корректный старт", () => {
    expect(courseStartSchema.safeParse(ok).success).toBe(true);
    expect(courseStartSchema.safeParse({ ...ok, remindDays: [], cm: 0 }).success).toBe(true);
  });

  it("отклоняет чужой навык, день 7, повтор дня и неверный замер", () => {
    expect(courseStartSchema.safeParse({ ...ok, skill: "BRIDGE" }).success).toBe(false);
    expect(courseStartSchema.safeParse({ ...ok, remindDays: [7] }).success).toBe(false);
    expect(courseStartSchema.safeParse({ ...ok, remindDays: [1, 1] }).success).toBe(false);
    expect(courseStartSchema.safeParse({ ...ok, cm: 200.5 }).success).toBe(false);
    expect(courseStartSchema.safeParse({ ...ok, cm: 12.3 }).success).toBe(false);
  });
});

describe("courseAdvance", () => {
  const now = new Date("2026-10-28T10:00:00Z");
  const c = (status: string, nextSession: number) => ({ status, nextSession, finishedAt: null });
  const w = (courseSessionNo: number | null, hasDoneSet = true) => ({ courseSessionNo, hasDoneSet });

  it("двигает на следующее занятие", () => {
    expect(courseAdvance(c("ACTIVE", 8), w(8), now)).toEqual({ nextSession: 9 });
  });
  it("старое или чужое занятие не двигает", () => {
    expect(courseAdvance(c("ACTIVE", 8), w(7), now)).toBeNull();
    expect(courseAdvance(c("ACTIVE", 8), w(null), now)).toBeNull();
  });
  it("без выполненных подходов не двигает", () => {
    expect(courseAdvance(c("ACTIVE", 8), w(8, false), now)).toBeNull();
  });
  it("брошенный и завершённый курс не двигаются", () => {
    expect(courseAdvance(c("ABANDONED", 8), w(8), now)).toBeNull();
    expect(courseAdvance(c("COMPLETED", 31), w(31), now)).toBeNull();
  });
  it("30-е занятие ставит finishedAt", () => {
    expect(courseAdvance(c("ACTIVE", 30), w(30), now)).toEqual({ nextSession: 31, finishedAt: now });
  });
  it("поддержка идёт без finishedAt", () => {
    expect(courseAdvance(c("MAINTENANCE", 35), w(35), now)).toEqual({ nextSession: 36 });
  });
});

describe("shouldRemindCourse", () => {
  const base = { timeZone: "Europe/Moscow", remindDays: [0], remindedDay: null, trainedToday: false };
  // 2026-10-26 — понедельник
  it("в выбранный день после 17:00", () => {
    expect(shouldRemindCourse({ ...base, now: new Date("2026-10-26T14:05:00Z") })).toEqual({ day: "2026-10-26" });
  });
  it("до 17:00 — нет", () => {
    expect(shouldRemindCourse({ ...base, now: new Date("2026-10-26T13:59:00Z") })).toBeNull();
  });
  it("не выбранный день — нет", () => {
    expect(shouldRemindCourse({ ...base, now: new Date("2026-10-27T15:00:00Z") })).toBeNull();
  });
  it("уже напоминали сегодня — нет", () => {
    expect(shouldRemindCourse({ ...base, now: new Date("2026-10-26T15:00:00Z"), remindedDay: "2026-10-26" })).toBeNull();
  });
  it("сегодня уже занимался — нет", () => {
    expect(shouldRemindCourse({ ...base, now: new Date("2026-10-26T15:00:00Z"), trainedToday: true })).toBeNull();
  });
  it("местный день — по поясу пользователя", () => {
    // UTC вт 04:30 = Etc/GMT+11 пн 17:30 (по UTC день уже вторник)
    expect(shouldRemindCourse({ ...base, timeZone: "Etc/GMT+11", now: new Date("2026-10-27T04:30:00Z") })).toEqual({ day: "2026-10-26" });
    // и наоборот: UTC пн 20:00 = Etc/GMT-14 вт 10:00 — не понедельник и рано
    expect(shouldRemindCourse({ ...base, timeZone: "Etc/GMT-14", now: new Date("2026-10-26T20:00:00Z") })).toBeNull();
  });
});

describe("courseReminderBody", () => {
  it("этап и номер занятия", () => {
    expect(courseReminderBody({ nextSession: 8, status: "ACTIVE" })).toBe("Сегодня занятие курса: этап 2, занятие 8 из 30");
  });
  it("поддержка", () => {
    expect(courseReminderBody({ nextSession: 31, status: "MAINTENANCE" })).toBe("Сегодня занятие поддержки шпагата");
  });
});
