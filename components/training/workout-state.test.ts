import { describe, expect, it } from "vitest";
import { initState, isCollapsed, isExerciseDone, lastWorkedKey, reducer, toDraft, type ExerciseState, type WorkoutState } from "./workout-state";

const bench = { id: "bench", name: "Жим лёжа", muscleGroups: ["CHEST" as const], isBodyweight: false };
const pullup = { id: "pullup", name: "Подтягивания", muscleGroups: ["BACK" as const], isBodyweight: true };
const NOW = "2026-10-06T10:00:00.000Z";

function empty(): WorkoutState {
  return initState({ id: "w", name: "Push", status: "PLANNED", startedAt: null, updatedAt: NOW, planKey: null, templateId: null, exercises: [] });
}

describe("workout reducer", () => {
  it("adds exercises prefilled from last performance, or 3 empty sets", () => {
    const s = reducer(empty(), {
      type: "addExercises",
      exercises: [
        { exercise: bench, restSec: 120 },
        { exercise: pullup, restSec: 90 },
      ],
      last: { bench: { date: NOW, sets: [{ weight: 100, reps: 5 }, { weight: 102.5, reps: 4 }] } },
    });
    expect(s.exercises).toHaveLength(2);
    expect(s.exercises[0].sets.map((x) => [x.weight, x.reps])).toEqual([["100", "5"], ["102.5", "4"]]);
    expect(s.exercises[1].sets).toHaveLength(3);
    expect(s.exercises[1].sets[0]).toMatchObject({ weight: "", reps: "" });
  });

  it("setWarmup inserts warm-up sets before working ones and replaces unfinished warm-ups", () => {
    let s = reducer(empty(), {
      type: "addExercises",
      exercises: [{ exercise: bench, restSec: 90 }],
      last: { bench: { date: NOW, sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] } },
    });
    const k = s.exercises[0].key;
    const plan = [
      { weight: 20, reps: 10 },
      { weight: 60, reps: 3 },
    ];
    s = reducer(s, { type: "setWarmup", key: k, sets: plan });
    expect(s.exercises[0].sets.map((x) => [x.weight, x.reps, x.isWarmup])).toEqual([
      ["20", "10", true],
      ["60", "3", true],
      ["100", "5", false],
      ["100", "5", false],
    ]);
    // Первую разминку выполнили — повторное нажатие заменяет только невыполненные
    s = reducer(s, { type: "toggleComplete", key: k, setKey: s.exercises[0].sets[0].key, now: NOW });
    s = reducer(s, { type: "setWarmup", key: k, sets: [{ weight: 50, reps: 5 }] });
    expect(s.exercises[0].sets.map((x) => [x.weight, x.isWarmup, Boolean(x.completedAt)])).toEqual([
      ["20", true, true],
      ["50", true, false],
      ["100", false, false],
      ["100", false, false],
    ]);
  });

  it("addSet copies the previous set values, unlimited", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = s.exercises[0].key;
    const firstSet = s.exercises[0].sets[0].key;
    s = reducer(s, { type: "updateSet", key: k, setKey: s.exercises[0].sets[2].key, patch: { weight: "80", reps: "8" } });
    for (let i = 0; i < 10; i++) s = reducer(s, { type: "addSet", key: k });
    expect(s.exercises[0].sets).toHaveLength(13);
    expect(s.exercises[0].sets.at(-1)).toMatchObject({ weight: "80", reps: "8", completedAt: null });

    s = reducer(s, { type: "removeSet", key: k, setKey: firstSet });
    expect(s.exercises[0].sets).toHaveLength(12);
  });

  it("toggles completion, moves exercises and clamps rest", () => {
    let s = reducer(empty(), {
      type: "addExercises",
      exercises: [
        { exercise: bench, restSec: 90 },
        { exercise: pullup, restSec: 90 },
      ],
      last: {},
    });
    const [a, b] = s.exercises;
    s = reducer(s, { type: "toggleComplete", key: a.key, setKey: a.sets[0].key, now: NOW });
    expect(s.exercises[0].sets[0].completedAt).toBe(NOW);
    s = reducer(s, { type: "toggleComplete", key: a.key, setKey: a.sets[0].key, now: NOW });
    expect(s.exercises[0].sets[0].completedAt).toBeNull();

    s = reducer(s, { type: "moveExercise", key: b.key, delta: -1 });
    expect(s.exercises.map((e) => e.exercise.id)).toEqual(["pullup", "bench"]);
    expect(reducer(s, { type: "moveExercise", key: b.key, delta: -1 })).toBe(s);

    s = reducer(s, { type: "setRest", key: a.key, restSec: 9999 });
    expect(s.exercises[1].restSec).toBe(600);
  });

  it("completing a working set copies its values into the next pending set only if that one is empty", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = s.exercises[0].key;
    const set = (i: number) => s.exercises[0].sets[i];
    const values = () => s.exercises[0].sets.map((x) => [x.weight, x.reps]);
    s = reducer(s, { type: "updateSet", key: k, setKey: set(0).key, patch: { weight: "20", reps: "11" } });
    s = reducer(s, { type: "toggleComplete", key: k, setKey: set(0).key, now: NOW });
    expect(values()).toEqual([["20", "11"], ["20", "11"], ["", ""]]);

    // Заполненный следующий подход не перезаписывается
    s = reducer(s, { type: "updateSet", key: k, setKey: set(2).key, patch: { weight: "25", reps: "8" } });
    s = reducer(s, { type: "toggleComplete", key: k, setKey: set(1).key, now: NOW });
    expect(values()).toEqual([["20", "11"], ["20", "11"], ["25", "8"]]);

    // Снятие отметки ничего не копирует
    s = reducer(s, { type: "updateSet", key: k, setKey: set(2).key, patch: { weight: "", reps: "" } });
    s = reducer(s, { type: "toggleComplete", key: k, setKey: set(1).key, now: NOW });
    expect(values()).toEqual([["20", "11"], ["20", "11"], ["", ""]]);
  });

  it("completing a warm-up set copies nothing; bodyweight copies reps", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = s.exercises[0].key;
    s = reducer(s, { type: "setWarmup", key: k, sets: [{ weight: 20, reps: 10 }] });
    s = reducer(s, { type: "toggleComplete", key: k, setKey: s.exercises[0].sets[0].key, now: NOW });
    expect(s.exercises[0].sets[1]).toMatchObject({ weight: "", reps: "" });

    let p = reducer(empty(), { type: "addExercises", exercises: [{ exercise: pullup, restSec: 90 }], last: {} });
    const pk = p.exercises[0].key;
    p = reducer(p, { type: "updateSet", key: pk, setKey: p.exercises[0].sets[0].key, patch: { reps: "12" } });
    p = reducer(p, { type: "toggleComplete", key: pk, setKey: p.exercises[0].sets[0].key, now: NOW });
    expect(p.exercises[0].sets[1]).toMatchObject({ weight: "", reps: "12" });
  });

  it("restoreSet puts a removed set back at its position", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = s.exercises[0].key;
    s = reducer(s, { type: "updateSet", key: k, setKey: s.exercises[0].sets[1].key, patch: { weight: "60", reps: "8", rir: 2 } });
    s = reducer(s, { type: "toggleComplete", key: k, setKey: s.exercises[0].sets[1].key, now: NOW });
    const removed = s.exercises[0].sets[1];
    s = reducer(s, { type: "removeSet", key: k, setKey: removed.key });
    expect(s.exercises[0].sets).toHaveLength(2);
    s = reducer(s, { type: "restoreSet", key: k, index: 1, set: removed });
    expect(s.exercises[0].sets[1]).toEqual(removed);
    expect(s.exercises[0].sets).toHaveLength(3);
    // Повтор и удалённое упражнение — без изменений
    expect(reducer(s, { type: "restoreSet", key: k, index: 1, set: removed })).toBe(s);
    expect(reducer(s, { type: "restoreSet", key: "nope", index: 0, set: { ...removed, key: "x" } })).toBe(s);
    // Индекс за границей — в конец
    s = reducer(s, { type: "removeSet", key: k, setKey: removed.key });
    s = reducer(s, { type: "restoreSet", key: k, index: 99, set: removed });
    expect(s.exercises[0].sets.at(-1)).toEqual(removed);
  });

  const squat = { id: "squat", name: "Присед", muscleGroups: ["LEGS" as const], isBodyweight: false };
  const ids = (s: WorkoutState) => s.exercises.map((e) => e.exercise.id);
  const three = () =>
    reducer(empty(), {
      type: "addExercises",
      exercises: [bench, pullup, squat].map((exercise) => ({ exercise, restSec: 90 })),
      last: {},
    });

  it("inserts dropped exercises at the given index (clamped), appends without it", () => {
    const deadlift = { id: "deadlift", name: "Становая", muscleGroups: ["BACK" as const], isBodyweight: false };
    const add = (index?: number) =>
      reducer(three(), { type: "addExercises", exercises: [{ exercise: deadlift, restSec: 180 }], last: {}, index });
    expect(ids(add(0))).toEqual(["deadlift", "bench", "pullup", "squat"]);
    expect(ids(add(2))).toEqual(["bench", "pullup", "deadlift", "squat"]);
    expect(ids(add(99))).toEqual(["bench", "pullup", "squat", "deadlift"]);
    expect(ids(add(-5))).toEqual(["deadlift", "bench", "pullup", "squat"]);
    expect(ids(add())).toEqual(["bench", "pullup", "squat", "deadlift"]);
  });

  it("reorders an exercise to a target index", () => {
    const s = three();
    const [a, , c] = s.exercises;
    expect(ids(reducer(s, { type: "reorderExercise", key: c.key, toIndex: 0 }))).toEqual(["squat", "bench", "pullup"]);
    expect(ids(reducer(s, { type: "reorderExercise", key: a.key, toIndex: 2 }))).toEqual(["pullup", "squat", "bench"]);
    // Та же позиция, неизвестный ключ, выход за границы — состояние не меняется
    expect(reducer(s, { type: "reorderExercise", key: a.key, toIndex: 0 })).toBe(s);
    expect(reducer(s, { type: "reorderExercise", key: "nope", toIndex: 1 })).toBe(s);
    expect(reducer(s, { type: "reorderExercise", key: a.key, toIndex: 3 })).toBe(s);
  });
});

describe("toDraft", () => {
  it("parses comma decimals and empty inputs", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const e = s.exercises[0];
    s = reducer(s, { type: "updateSet", key: e.key, setKey: e.sets[0].key, patch: { weight: "82,5", reps: "6" } });
    s = reducer(s, { type: "rename", name: "   " });
    const draft = toDraft(s);
    expect(draft.name).toBe("Тренировка");
    expect(draft.exercises[0].sets[0]).toEqual({ weight: 82.5, reps: 6, isWarmup: false, rir: null, completedAt: null });
    expect(draft.exercises[0].sets[1]).toMatchObject({ weight: 0, reps: 0 });
  });
});

describe("assistant actions", () => {
  const squat = { id: "squat", name: "Присед", muscleGroups: ["LEGS" as const], isBodyweight: false };
  const press = { id: "press", name: "Жим ногами", muscleGroups: ["LEGS" as const], isBodyweight: false };

  it("applySets replaces only unfinished working sets", () => {
    let s = reducer(empty(), {
      type: "addExercises",
      exercises: [{ exercise: bench, restSec: 90 }],
      last: { bench: { date: NOW, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] } },
    });
    const k = s.exercises[0].key;
    s = reducer(s, { type: "setWarmup", key: k, sets: [{ weight: 20, reps: 10 }] });
    const firstWork = s.exercises[0].sets[1].key;
    s = reducer(s, { type: "toggleComplete", key: k, setKey: firstWork, now: NOW });
    s = reducer(s, { type: "applySets", key: k, sets: [{ weight: 62.5, reps: 8 }, { weight: 62.5, reps: 8 }, { weight: 62.5, reps: 8 }] });
    expect(s.exercises[0].sets.map((x) => [x.weight, x.reps, x.isWarmup, Boolean(x.completedAt)])).toEqual([
      ["20", "10", true, false],
      ["60", "8", false, true],
      ["62.5", "8", false, false],
      ["62.5", "8", false, false],
    ]);
  });

  it("applySets adds missing sets and drops extra unfinished ones", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = s.exercises[0].key;
    s = reducer(s, { type: "applySets", key: k, sets: Array.from({ length: 4 }, () => ({ weight: 40, reps: 10 })) });
    expect(s.exercises[0].sets).toHaveLength(4);
    s = reducer(s, { type: "applySets", key: k, sets: [{ weight: 0, reps: 12 }] });
    expect(s.exercises[0].sets.map((x) => [x.weight, x.reps])).toEqual([["", "12"]]);
  });

  it("replaceExercise swaps in place without completed sets, otherwise inserts after", () => {
    let s = reducer(empty(), {
      type: "addExercises",
      exercises: [{ exercise: squat, restSec: 120 }, { exercise: bench, restSec: 90 }],
      last: {},
    });
    const k = s.exercises[0].key;
    const last = { press: { date: NOW, sets: [{ weight: 100, reps: 10 }] } };
    const swapped = reducer(s, { type: "replaceExercise", key: k, exercise: press, restSec: 120, last });
    expect(swapped.exercises.map((e) => e.exercise.id)).toEqual(["press", "bench"]);
    expect(swapped.exercises[0].sets.map((x) => [x.weight, x.reps])).toEqual([["100", "10"]]);

    s = reducer(s, { type: "toggleComplete", key: k, setKey: s.exercises[0].sets[0].key, now: NOW });
    const added = reducer(s, { type: "replaceExercise", key: k, exercise: press, restSec: 120, last });
    expect(added.exercises.map((e) => e.exercise.id)).toEqual(["squat", "press", "bench"]);
  });
});

describe("skipPending", () => {
  it("drops unfinished sets but keeps completed ones; nothing done — removes the exercise", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }, { exercise: pullup, restSec: 90 }], last: {} });
    const [a, b] = s.exercises.map((e) => e.key);
    s = reducer(s, { type: "toggleComplete", key: a, setKey: s.exercises[0].sets[0].key, now: NOW });
    s = reducer(s, { type: "skipPending", key: a });
    expect(s.exercises[0].sets).toHaveLength(1);
    expect(s.exercises[0].sets[0].completedAt).toBe(NOW);
    s = reducer(s, { type: "skipPending", key: b });
    expect(s.exercises.map((e) => e.exercise.id)).toEqual(["bench"]);
  });
});

describe("collapsing done exercises", () => {
  const ex = (key: string, done: (string | null)[]): ExerciseState => ({
    key,
    exercise: { id: key, name: key, muscleGroups: [], isBodyweight: false } as unknown as ExerciseState["exercise"],
    restSec: 90,
    sets: done.map((completedAt, i) => ({ key: `${key}${i}`, weight: "60", reps: "10", isWarmup: false, rir: null, completedAt })),
  });
  const t = (m: number) => new Date(Date.UTC(2026, 9, 14, 10, m)).toISOString();

  it("done = every set completed, an exercise without sets is not done", () => {
    expect(isExerciseDone(ex("a", [t(1), t(2)]))).toBe(true);
    expect(isExerciseDone(ex("a", [t(1), null]))).toBe(false);
    expect(isExerciseDone(ex("a", []))).toBe(false);
  });

  it("last worked exercise — the one with the latest completed set", () => {
    expect(lastWorkedKey([ex("a", [t(1), t(5)]), ex("b", [t(3), null])])).toBe("a");
    expect(lastWorkedKey([ex("a", [t(1), t(2)]), ex("b", [t(3), null])])).toBe("b");
    expect(lastWorkedKey([ex("a", [null])])).toBeNull();
  });

  it("done exercise stays open until a set is completed elsewhere; manual choice wins", () => {
    const a = ex("a", [t(1), t(2)]);
    const b = ex("b", [t(3), null]);
    expect(isCollapsed(a, "a")).toBe(false);
    expect(isCollapsed(a, "b")).toBe(true);
    expect(isCollapsed(b, "a")).toBe(false);
    expect(isCollapsed(a, "b", false)).toBe(false);
    expect(isCollapsed(b, "a", true)).toBe(true);
  });
});
