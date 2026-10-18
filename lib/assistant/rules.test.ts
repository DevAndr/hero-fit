import { describe, expect, it } from "vitest";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { timedSetText } from "@/lib/workouts/kinds";
import {
  lastResultText,
  missedPlanAdvice,
  nextStep,
  painRelated,
  repsOrWeight,
  replacementCandidates,
  stalledExercises,
  weightAdvice,
} from "./rules";

const last60 = { sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 7 }] };
const base = {
  bodyweight: false,
  groups: ["CHEST", "TRICEPS"] as MuscleGroup[],
  last: last60,
  hint: null,
  coach: null,
  own: null,
  wellbeing: null,
  pain: [],
};

describe("weightAdvice", () => {
  it("задание тренера важнее всего", () => {
    const a = weightAdvice({
      ...base,
      coach: { sets: 4, reps: 8, weight: 42.5 },
      own: { sets: 3, reps: 5, weight: 100 },
      hint: { kind: "weight", current: 60, suggested: 62.5 },
    });
    expect(a).toMatchObject({ kind: "sets", source: "coach", weight: 42.5, sets: 4, reps: 8 });
  });

  it("затем своя прогрессия, затем подсказка, затем прошлый раз", () => {
    const hint = { kind: "weight", current: 60, suggested: 62.5 } as const;
    expect(weightAdvice({ ...base, own: { sets: 3, reps: 5, weight: 100 }, hint })).toMatchObject({ source: "own", weight: 100, sets: 3, reps: 5 });
    expect(weightAdvice({ ...base, hint })).toMatchObject({ source: "hint", weight: 62.5, sets: 3, reps: 7 });
    expect(weightAdvice(base)).toMatchObject({ source: "last", weight: 60, sets: 3, reps: 7 });
  });

  it("недостающее в задании берётся из прошлого раза", () => {
    expect(weightAdvice({ ...base, coach: { sets: null, reps: null, weight: 65 } })).toMatchObject({ weight: 65, sets: 3, reps: 7 });
  });

  it("устал — без прибавки, задание тренера с пометкой", () => {
    const hint = { kind: "weight", current: 60, suggested: 62.5 } as const;
    expect(weightAdvice({ ...base, hint, wellbeing: "TIRED" })).toMatchObject({ source: "last", weight: 60 });
    const coach = weightAdvice({ ...base, coach: { sets: 3, reps: 8, weight: 65 }, wellbeing: "TIRED" });
    expect(coach).toMatchObject({ source: "coach", weight: 65 });
    expect(coach.kind === "sets" && coach.note).toContain("можно остаться на 60 кг");
  });

  it("боль в связанной области — пропустить", () => {
    expect(weightAdvice({ ...base, groups: ["LEGS"], pain: ["knee"] })).toEqual({ kind: "pain" });
    expect(weightAdvice({ ...base, pain: ["shoulder"] })).toEqual({ kind: "pain" });
    expect(weightAdvice({ ...base, groups: ["BICEPS"], pain: ["knee"] }).kind).toBe("sets");
  });

  it("без истории — первый раз; свой вес — только повторы", () => {
    expect(weightAdvice({ ...base, last: null })).toEqual({ kind: "first", bodyweight: false });
    expect(weightAdvice({ ...base, last: { sets: [] } })).toEqual({ kind: "first", bodyweight: false });
    const bw = weightAdvice({ ...base, bodyweight: true, last: { sets: [{ weight: 0, reps: 12 }] }, hint: { kind: "reps", current: 12, suggested: 14 } });
    expect(bw).toMatchObject({ kind: "sets", weight: 0, reps: 14 });
    expect(bw.kind === "sets" && bw.why).not.toMatch(/кг/);
  });
});

describe("painRelated", () => {
  it("любая группа упражнения в наборе места, «другое» — никогда", () => {
    expect(painRelated(["CHEST", "TRICEPS"], ["shoulder"])).toBe(true);
    expect(painRelated(["BACK"], ["lowerBack"])).toBe(true);
    expect(painRelated(["BICEPS"], ["knee"])).toBe(false);
    expect(painRelated(["LEGS"], ["other"])).toBe(false);
  });
});

describe("nextStep / repsOrWeight", () => {
  it("шаг 1 кг до 20, затем 2,5", () => {
    expect(nextStep(15)).toBe(16);
    expect(nextStep(20)).toBe(22.5);
  });
  it("свой вес — повторы", () => {
    expect(repsOrWeight({ bodyweight: true, last: null }).text).toMatch(/повтор/);
    expect(repsOrWeight({ bodyweight: false, last: last60 }).why).toContain("62,5");
  });
});

describe("replacementCandidates", () => {
  const ex = (id: string, muscleGroups: MuscleGroup[], userId: string | null = null, archivedAt: string | null = null) => ({ id, muscleGroups, userId, archivedAt });
  const all = [
    ex("bench", ["CHEST", "TRICEPS"]),
    ex("fly", ["CHEST"]),
    ex("dips", ["CHEST", "TRICEPS", "SHOULDERS"]),
    ex("incline", ["CHEST", "SHOULDERS"]),
    ex("pushup", ["CHEST"]),
    ex("mine", ["CHEST"], "u1"),
    ex("old", ["CHEST"], "u1", "2026-01-01"),
    ex("row", ["BACK"]),
  ];
  it("та же основная группа, недавние первыми, затем встроенные, до 3", () => {
    const r = replacementCandidates(all[0], all, { inWorkout: ["bench", "fly"], pain: [], lastDate: { mine: "2026-10-01", pushup: "2026-10-05", incline: "2026-05-01" }, today: "2026-10-12" });
    expect(r.map((e) => e.id)).toEqual(["pushup", "mine", "dips"]);
  });
  it("без связанных с болью", () => {
    const r = replacementCandidates(all[0], all, { inWorkout: ["bench"], pain: ["shoulder"], lastDate: {}, today: "2026-10-12" });
    expect(r).toEqual([]);
  });
  it("без связанных с болью — только по их группам", () => {
    const r = replacementCandidates(all[0], all, { inWorkout: ["bench"], pain: ["elbow"], lastDate: {}, today: "2026-10-12" });
    expect(r.map((e) => e.id)).toEqual(["fly", "incline", "pushup"]);
  });
});

describe("stalledExercises", () => {
  it("4+ тренировок за 6 недель и рекорд 4+ недели назад", () => {
    const r = stalledExercises(
      [
        { exerciseId: "a", name: "A", workouts6w: 5, lastRecordAt: "2026-09-01" },
        { exerciseId: "b", name: "B", workouts6w: 4, lastRecordAt: null },
        { exerciseId: "c", name: "C", workouts6w: 6, lastRecordAt: "2026-10-01" },
        { exerciseId: "d", name: "D", workouts6w: 3, lastRecordAt: "2026-01-01" },
        { exerciseId: "e", name: "E", workouts6w: 4, lastRecordAt: "2026-09-10" },
        { exerciseId: "f", name: "F", workouts6w: 4, lastRecordAt: "2026-08-01" },
      ],
      "2026-10-12",
    );
    expect(r.map((x) => x.exerciseId)).toEqual(["b", "f", "a"]);
    expect(r[2].weeks).toBe(5);
  });
});

describe("missedPlanAdvice", () => {
  const m = (date: string, coach = false) => ({ key: "k", title: "Ноги", date, coach });
  it("тексты и кнопка", () => {
    expect(missedPlanAdvice(null, "2026-10-12", false)).toBeNull();
    expect(missedPlanAdvice(m("2026-10-11"), "2026-10-12", false)).toEqual({ text: expect.stringContaining("Сделай её сегодня — следующую можно сдвинуть"), canStart: true });
    expect(missedPlanAdvice(m("2026-10-08"), "2026-10-12", true)!.text).toContain("Одна пропущенная не страшна — продолжай по плану");
    expect(missedPlanAdvice(m("2026-10-08"), "2026-10-12", true)!.canStart).toBe(false);
    expect(missedPlanAdvice(m("2026-10-11", true), "2026-10-12", false)!.text).toContain("Твой тренер увидит пропуск — сделать её можно сегодня");
  });
});

describe("вес не записан (0) у упражнения с отягощением", () => {
  const noWeight = { sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }] };
  it("ни «0 кг», ни «1 кг»", () => {
    const a = weightAdvice({ ...base, last: noWeight, hint: { kind: "reps", current: 10, suggested: 12 } });
    expect(a.kind === "sets" && a.why).not.toMatch(/0 кг/);
    const tired = weightAdvice({ ...base, last: noWeight, coach: { sets: 3, reps: 10, weight: 40 }, wellbeing: "TIRED" });
    expect(tired.kind === "sets" && tired.note).toBeFalsy();
    expect(repsOrWeight({ bodyweight: false, last: noWeight }).why).not.toMatch(/бери|(^|[^\d,])0 кг/);
  });
});

describe("replacementCandidates — exercise kinds", () => {
  it("a squat is not replaced with running, crunches not with a plank", () => {
    const all = [
      { id: "squat", muscleGroups: ["LEGS" as const], userId: null, kind: "REPS" as const },
      { id: "run", muscleGroups: ["LEGS" as const], userId: null, kind: "CARDIO" as const },
      { id: "lunge", muscleGroups: ["LEGS" as const], userId: null, kind: "REPS" as const },
    ];
    const ids = replacementCandidates(all[0], all, { inWorkout: ["squat"], pain: [], lastDate: {}, today: "2026-10-12" }).map((e) => e.id);
    expect(ids).toEqual(["lunge"]);
  });
});

describe("lastResultText", () => {
  const sets = (n: number, weight: number, reps: number) => ({ date: "2026-10-01", sets: Array.from({ length: n }, () => ({ weight, reps })) });
  it("без истории — «ещё не делали»", () => {
    expect(lastResultText({ isBodyweight: false }, undefined)).toBe("ещё не делали");
    expect(lastResultText({ isBodyweight: false }, { date: "2026-10-01", sets: [] })).toBe("ещё не делали");
  });
  it("силовое — подходы × повторы · вес", () => {
    expect(lastResultText({ isBodyweight: false }, sets(3, 60, 10))).toBe("в прошлый раз 3 × 10 · 60 кг");
  });
  it("своим весом — без «0 кг»", () => {
    expect(lastResultText({ isBodyweight: true }, sets(3, 0, 12))).toBe("в прошлый раз 3 × 12");
  });
  it("на время — по первому подходу", () => {
    const last = { date: "2026-10-01", sets: [{ weight: 0, reps: 0, durationSec: 60 }] };
    expect(lastResultText({ isBodyweight: true, kind: "TIME" }, last)).toBe(`в прошлый раз ${timedSetText("TIME", { durationSec: 60 })}`);
  });
});
