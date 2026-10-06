import { describe, expect, it } from "vitest";
import { initState, reducer, toDraft, type WorkoutState } from "./workout-state";

const bench = { id: "bench", name: "Жим лёжа", muscleGroups: ["CHEST" as const], isBodyweight: false };
const pullup = { id: "pullup", name: "Подтягивания", muscleGroups: ["BACK" as const], isBodyweight: true };
const NOW = "2026-10-06T10:00:00.000Z";

function empty(): WorkoutState {
  return initState({ id: "w", name: "Push", status: "PLANNED", startedAt: null, exercises: [] });
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
});

describe("toDraft", () => {
  it("parses comma decimals and empty inputs", () => {
    let s = reducer(empty(), { type: "addExercises", exercises: [{ exercise: bench, restSec: 90 }], last: {} });
    const e = s.exercises[0];
    s = reducer(s, { type: "updateSet", key: e.key, setKey: e.sets[0].key, patch: { weight: "82,5", reps: "6" } });
    s = reducer(s, { type: "rename", name: "   " });
    const draft = toDraft(s);
    expect(draft.name).toBe("Тренировка");
    expect(draft.exercises[0].sets[0]).toEqual({ weight: 82.5, reps: 6, isWarmup: false, completedAt: null });
    expect(draft.exercises[0].sets[1]).toMatchObject({ weight: 0, reps: 0 });
  });
});
