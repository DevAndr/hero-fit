import { describe, expect, it } from "vitest";
import { forgottenSince, initState, isCollapsed, isExerciseDone, lastWorkedKey, liveSets, nextStep, reducer, toDraft, type ExerciseState, type WorkoutState } from "./workout-state";

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

  it("restoreSet puts a removed set back at its place", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = s.exercises[0].key;
    s = reducer(s, { type: "updateSet", key: k, setKey: s.exercises[0].sets[1].key, patch: { weight: "60", reps: "8", rir: 2 } });
    s = reducer(s, { type: "toggleComplete", key: k, setKey: s.exercises[0].sets[1].key, now: NOW });
    const [first, removed, third] = s.exercises[0].sets;
    const restore = { type: "restoreSet", key: k, after: first.key, before: third.key, index: 1, set: removed } as const;
    s = reducer(s, { type: "removeSet", key: k, setKey: removed.key });
    expect(s.exercises[0].sets).toHaveLength(2);
    s = reducer(s, restore);
    expect(s.exercises[0].sets).toEqual([first, removed, third]);
    // Повтор и удалённое упражнение — без изменений
    expect(reducer(s, restore)).toBe(s);
    expect(reducer(s, { ...restore, key: "nope", set: { ...removed, key: "x" } })).toBe(s);
  });

  it("restoreSet keeps the order when several removed sets come back in any order", () => {
    const start = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const k = start.exercises[0].key;
    const [a, b, c] = start.exercises[0].sets;
    const order = (s: WorkoutState) => s.exercises[0].sets.map((x) => x.key);
    // Соседи — на момент удаления: удалили a, затем b (он уже первый); то же — c, затем b (он уже последний)
    const backA = { type: "restoreSet", key: k, after: null, before: b.key, index: 0, set: a } as const;
    const backBFirst = { type: "restoreSet", key: k, after: null, before: c.key, index: 0, set: b } as const;
    const backC = { type: "restoreSet", key: k, after: b.key, before: null, index: 2, set: c } as const;
    const backBLast = { type: "restoreSet", key: k, after: a.key, before: null, index: 1, set: b } as const;
    const front = [a, b].reduce((s, x) => reducer(s, { type: "removeSet", key: k, setKey: x.key }), start);
    const back = [c, b].reduce((s, x) => reducer(s, { type: "removeSet", key: k, setKey: x.key }), start);
    for (const s of [
      reducer(reducer(front, backA), backBFirst),
      reducer(reducer(front, backBFirst), backA),
      reducer(reducer(back, backC), backBLast),
      reducer(reducer(back, backBLast), backC),
    ]) {
      expect(order(s)).toEqual([a.key, b.key, c.key]);
    }
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
    expect(draft.exercises[0].sets[0]).toEqual({ weight: 82.5, reps: 6, durationSec: null, distanceM: null, isWarmup: false, rir: null, completedAt: null });
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
    group: null,
    restSec: 90,
    sets: done.map((completedAt, i) => ({ key: `${key}${i}`, weight: "60", reps: "10", duration: "", distance: "", isWarmup: false, rir: null, completedAt })),
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

describe("forgottenSince", () => {
  const at = (iso: string) => Date.parse(iso);
  function started(): WorkoutState {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }, { exercise: pullup, restSec: 90 }], last: {} });
    s = reducer(s, { type: "started", startedAt: "2026-10-06T09:00:00.000Z" });
    const [a, b] = s.exercises;
    s = reducer(s, { type: "toggleComplete", key: a.key, setKey: a.sets[0].key, now: "2026-10-06T09:40:00.000Z" });
    s = reducer(s, { type: "toggleComplete", key: b.key, setKey: b.sets[0].key, now: "2026-10-06T09:20:00.000Z" });
    return s;
  }

  it("last completed set an hour ago or more — its time", () => {
    expect(forgottenSince(started(), at("2026-10-06T10:40:00.000Z"))).toBe("2026-10-06T09:40:00.000Z");
    expect(forgottenSince(started(), at("2026-10-07T05:00:00.000Z"))).toBe("2026-10-06T09:40:00.000Z");
  });

  it("recent set, no completed sets or not started — null", () => {
    expect(forgottenSince(started(), at("2026-10-06T10:39:59.000Z"))).toBeNull();
    const s = reducer(empty(), { type: "started", startedAt: "2026-10-06T09:00:00.000Z" });
    expect(forgottenSince(s, at("2026-10-06T20:00:00.000Z"))).toBeNull();
    const planned = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    expect(forgottenSince(planned, at("2026-10-06T20:00:00.000Z"))).toBeNull();
  });
});

describe("workout reducer — supersets", () => {
  const squat = { id: "squat", name: "Присед", muscleGroups: ["LEGS" as const], isBodyweight: false };
  const dip = { id: "dip", name: "Брусья", muscleGroups: ["TRICEPS" as const], isBodyweight: true };
  const withExercises = (...list: ExerciseState["exercise"][]) =>
    reducer(empty(), { type: "addExercises", exercises: list.map((exercise) => ({ exercise, restSec: 90 })), last: {} });
  const groups = (s: WorkoutState) => s.exercises.map((e) => e.group);
  const names = (s: WorkoutState) => s.exercises.map((e) => e.exercise.id);

  it("linkNext and unlink", () => {
    let s = withExercises(bench, pullup, squat);
    expect(groups(s)).toEqual([null, null, null]);
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    expect(groups(s)).toEqual([1, 1, null]);
    s = reducer(s, { type: "unlink", key: s.exercises[0].key });
    expect(groups(s)).toEqual([null, null, null]);
  });

  it("removing one of a pair leaves no group", () => {
    let s = withExercises(bench, pullup);
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    s = reducer(s, { type: "removeExercise", key: s.exercises[1].key });
    expect(groups(s)).toEqual([null]);
  });

  it("dragging out of a group or into the middle of one keeps groups contiguous", () => {
    let s = withExercises(bench, pullup, squat);
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    s = reducer(s, { type: "reorderExercise", key: s.exercises[1].key, toIndex: 2 });
    expect(names(s)).toEqual(["bench", "squat", "pullup"]);
    expect(groups(s)).toEqual([null, null, null]);

    let t = withExercises(bench, pullup, squat, dip);
    t = reducer(t, { type: "linkNext", key: t.exercises[0].key });
    t = reducer(t, { type: "linkNext", key: t.exercises[1].key });
    expect(groups(t)).toEqual([1, 1, 1, null]);
    t = reducer(t, { type: "reorderExercise", key: t.exercises[3].key, toIndex: 1 });
    expect(names(t)).toEqual(["bench", "dip", "pullup", "squat"]);
    expect(groups(t)).toEqual([null, null, 1, 1]);
  });

  it("moveExercise across a group boundary renormalizes", () => {
    let s = withExercises(bench, pullup, squat);
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    s = reducer(s, { type: "moveExercise", key: s.exercises[2].key, delta: -1 });
    expect(groups(s)).toEqual([null, null, null]);
  });

  it("replace in place keeps the group; insert inside a group splits it", () => {
    let s = withExercises(bench, pullup, squat);
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    s = reducer(s, { type: "linkNext", key: s.exercises[1].key });
    s = reducer(s, { type: "replaceExercise", key: s.exercises[1].key, exercise: dip, restSec: 60, last: {} });
    expect(names(s)).toEqual(["bench", "dip", "squat"]);
    expect(groups(s)).toEqual([1, 1, 1]);
    s = reducer(s, { type: "addExercises", exercises: [{ exercise: pullup, restSec: 90 }], last: {}, index: 1 });
    expect(names(s)).toEqual(["bench", "pullup", "dip", "squat"]);
    expect(groups(s)).toEqual([null, null, 1, 1]);
  });

  it("initState and toDraft carry the group", () => {
    const s = initState({
      id: "w", name: "P", status: "PLANNED", startedAt: null, updatedAt: NOW, planKey: null, templateId: null,
      exercises: [
        { exercise: bench, restSec: 90, group: 1, sets: [] },
        { exercise: pullup, restSec: 90, group: 1, sets: [] },
      ],
    } as never);
    expect(groups(s)).toEqual([1, 1]);
    expect(toDraft(s).exercises.map((e) => e.group)).toEqual([1, 1]);
  });
});

describe("workout reducer — device state from before supersets", () => {
  it("replace normalizes a missing group to null", () => {
    const s = initState({ id: "w", name: "P", status: "PLANNED", startedAt: null, updatedAt: NOW, planKey: null, templateId: null, exercises: [] });
    const old = { ...s, exercises: [{ key: "a", exercise: bench, restSec: 90, sets: [] }, { key: "b", exercise: bench, restSec: 90, sets: [] }] } as unknown as WorkoutState;
    expect(reducer(s, { type: "replace", state: old }).exercises.map((e) => e.group)).toEqual([null, null]);
  });
});

describe("nextStep — after a set (supersets on)", () => {
  const squat = { id: "squat", name: "Присед", muscleGroups: ["LEGS" as const], isBodyweight: false };
  const pair = () => {
    let s = reducer(empty(), {
      type: "addExercises",
      exercises: [
        { exercise: bench, restSec: 120 },
        { exercise: pullup, restSec: 60 },
      ],
      last: {},
    });
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    return s;
  };

  it("A1 working set → switch to A2; A2 → rest of the last in group towards A1", () => {
    const s = pair();
    const [a1, a2] = s.exercises;
    expect(nextStep(s.exercises, a1, a1.sets[0])).toEqual({ kind: "switch", key: a2.key, label: "Подтягивания" });
    expect(nextStep(s.exercises, a2, a2.sets[0])).toEqual({ kind: "rest", restSec: 60, label: "Жим лёжа" });
  });

  it("a warm-up set inside a superset — ordinary rest of that exercise, no switch", () => {
    let s = pair();
    s = reducer(s, { type: "setWarmup", key: s.exercises[0].key, sets: [{ weight: 20, reps: 10 }] });
    const a1 = s.exercises[0];
    expect(nextStep(s.exercises, a1, a1.sets[0])).toEqual({ kind: "rest", restSec: 120, label: "Жим лёжа" });
  });

  it("outside a group — as before", () => {
    const s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: squat, restSec: 90 }], last: {} });
    const e = s.exercises[0];
    expect(nextStep(s.exercises, e, e.sets[0])).toEqual({ kind: "rest", restSec: 90, label: "Присед" });
  });
});

describe("replaceExercise inside a started round", () => {
  it("the replacement joins the same group", () => {
    let s = reducer(empty(), {
      type: "addExercises",
      exercises: [bench, pullup, bench].map((exercise) => ({ exercise, restSec: 90 })),
      last: {},
    });
    s = reducer(s, { type: "linkNext", key: s.exercises[0].key });
    s = reducer(s, { type: "linkNext", key: s.exercises[1].key });
    s = reducer(s, { type: "toggleComplete", key: s.exercises[1].key, setKey: s.exercises[1].sets[0].key, now: NOW });
    const dip = { id: "dip", name: "Брусья", muscleGroups: ["TRICEPS" as const], isBodyweight: true };
    s = reducer(s, { type: "replaceExercise", key: s.exercises[1].key, exercise: dip, restSec: 60, last: {} });
    expect(s.exercises.map((e) => e.exercise.id)).toEqual(["bench", "pullup", "dip", "bench"]);
    expect(s.exercises.map((e) => e.group)).toEqual([1, 1, 1, 1]);
  });
});

describe("timed and cardio sets in the editor", () => {
  const plank = { id: "plank", name: "Планка", muscleGroups: ["ABS" as const], isBodyweight: true, kind: "TIME" as const };
  const run = { id: "run", name: "Бег", muscleGroups: ["LEGS" as const], isBodyweight: true, kind: "CARDIO" as const };

  it("toDraft parses time and distance; the next empty set gets the values", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: plank, restSec: 60 }, { exercise: run, restSec: 120 }], last: {} });
    const [p, r] = s.exercises;
    s = reducer(s, { type: "updateSet", key: p.key, setKey: p.sets[0].key, patch: { duration: "1:30" } });
    s = reducer(s, { type: "updateSet", key: r.key, setKey: r.sets[0].key, patch: { duration: "28:40", distance: "5,2" } });
    s = reducer(s, { type: "toggleComplete", key: p.key, setKey: p.sets[0].key, now: NOW });
    expect(s.exercises[0].sets[1]).toMatchObject({ duration: "1:30" });
    const draft = toDraft(s);
    expect(draft.exercises[0].sets[0]).toMatchObject({ reps: 0, weight: 0, durationSec: 90 });
    expect(draft.exercises[1].sets[0]).toMatchObject({ durationSec: 1720, distanceM: 5200 });
  });

  it("last performance prefills time and distance", () => {
    const s = reducer(empty(), {
      type: "addExercises",
      exercises: [{ exercise: run, restSec: 120 }],
      last: { run: { date: NOW, sets: [{ weight: 0, reps: 0, durationSec: 1720, distanceM: 5200 }] } },
    });
    expect(s.exercises[0].sets.map((x) => [x.duration, x.distance])).toEqual([["28:40", "5,2"]]);
  });
});

describe("review fixes — timed sets carry no reps or weight", () => {
  const run = { id: "run", name: "Бег", muscleGroups: ["LEGS" as const], isBodyweight: true, kind: "CARDIO" as const };

  it("toDraft zeroes reps and weight of a cardio set (assistant or plan put 10 there)", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: run, restSec: 120 }], last: {} });
    const r = s.exercises[0];
    s = reducer(s, { type: "updateSet", key: r.key, setKey: r.sets[0].key, patch: { weight: "20", reps: "10", duration: "", distance: "1" } });
    expect(toDraft(s).exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 0, durationSec: null, distanceM: 1000 });
  });

  it("liveSets: a cardio set counts by time for the boss bar and the goblin", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: run, restSec: 120 }], last: {} });
    const r = s.exercises[0];
    s = reducer(s, { type: "updateSet", key: r.key, setKey: r.sets[0].key, patch: { duration: "30:00", distance: "5" } });
    s = reducer(s, { type: "toggleComplete", key: r.key, setKey: r.sets[0].key, now: NOW });
    expect(liveSets(s)[0]).toMatchObject({ reps: 0, durationSec: 1800, completedAt: NOW });
  });
});
