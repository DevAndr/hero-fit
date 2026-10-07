import { describe, expect, it } from "vitest";
import { progressionHint, repTable } from "./progression";

const session = (weight: number, reps: number[]) => ({ sets: reps.map((r) => ({ weight, reps: r })) });

describe("progressionHint", () => {
  it("needs at least 3 sessions", () => {
    expect(progressionHint([session(100, [5, 5]), session(100, [5, 5])])).toBeNull();
  });

  it("same top weight 3 sessions in a row without losing reps → +2.5 kg", () => {
    const hint = progressionHint([session(90, [5]), session(100, [5, 5, 5]), session(100, [5, 5, 5]), session(100, [5, 5, 6])]);
    expect(hint).toEqual({ kind: "weight", current: 100, suggested: 102.5 });
  });

  it("light weights grow by 1 kg", () => {
    expect(progressionHint([session(12, [12]), session(12, [12]), session(12, [12])])).toEqual({
      kind: "weight",
      current: 12,
      suggested: 13,
    });
  });

  it("no hint if the weight changed or reps dropped", () => {
    expect(progressionHint([session(100, [5]), session(100, [5]), session(102.5, [5])])).toBeNull();
    expect(progressionHint([session(100, [5, 5]), session(100, [5, 5]), session(100, [5, 3])])).toBeNull();
  });

  it("bodyweight: same reps 3 times → add reps", () => {
    expect(progressionHint([session(0, [10]), session(0, [10]), session(0, [10, 10])])).toEqual({
      kind: "reps",
      current: 10,
      suggested: 12,
    });
  });

  it("RIR 2+ in every working set → raise the weight after a single session", () => {
    const easy = { sets: [{ weight: 100, reps: 5, rir: 3 }, { weight: 100, reps: 5, rir: 2 }] };
    expect(progressionHint([easy])).toEqual({ kind: "weight", current: 100, suggested: 102.5, easy: true });
    // Разминка с меньшим весом не мешает: смотрим подходы с рабочим весом
    expect(progressionHint([{ sets: [{ weight: 60, reps: 8, rir: null }, ...easy.sets] }])).toMatchObject({ easy: true });
  });

  it("a set to failure (RIR 0) in the last session blocks the hint even after 3 equal sessions", () => {
    const failed = { sets: [{ weight: 100, reps: 5, rir: 1 }, { weight: 100, reps: 5, rir: 0 }] };
    expect(progressionHint([session(100, [5, 5]), session(100, [5, 5]), failed])).toBeNull();
  });

  it("RIR 1 or partly unknown → the usual 3-session rule", () => {
    const hard = { sets: [{ weight: 100, reps: 5, rir: 1 }, { weight: 100, reps: 5, rir: 1 }] };
    expect(progressionHint([hard])).toBeNull();
    expect(progressionHint([hard, hard, hard])).toEqual({ kind: "weight", current: 100, suggested: 102.5 });
    const partly = { sets: [{ weight: 100, reps: 5, rir: 3 }, { weight: 100, reps: 5, rir: null }] };
    expect(progressionHint([partly])).toBeNull();
  });

  it("bodyweight with easy RIR → add reps now", () => {
    expect(progressionHint([{ sets: [{ weight: 0, reps: 12, rir: 3 }] }])).toEqual({
      kind: "reps",
      current: 12,
      suggested: 14,
      easy: true,
    });
  });

  it("ignores sessions without sets", () => {
    expect(progressionHint([{ sets: [] }, session(100, [5]), session(100, [5]), session(100, [5])])).toMatchObject({
      kind: "weight",
    });
  });
});

describe("repTable", () => {
  it("inverts Epley: weight for N reps from 1RM", () => {
    const table = repTable(120);
    expect(table[0]).toEqual({ reps: 1, weight: 120, percent: 100 });
    expect(table.find((r) => r.reps === 10)).toEqual({ reps: 10, weight: 90, percent: 75 });
    expect(table).toHaveLength(12);
  });
});
