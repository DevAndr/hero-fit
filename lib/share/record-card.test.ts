import { describe, expect, it } from "vitest";
import type { RecordType } from "@/generated/prisma/enums";
import { formatRecord } from "@/lib/progress/records";
import type { FinishMeta, NewRecord } from "@/lib/workouts/finish";
import { recordCards, type RecordCardInput } from "./record-card";

const NB = " ";

function rec(exerciseName: string, type: RecordType, previous: number, value: number): NewRecord {
  return { exerciseId: exerciseName, exerciseName, type, previous, value };
}

function input(records: NewRecord[], patch: Partial<RecordCardInput> = {}): RecordCardInput {
  return {
    meta: { xpBefore: 0, levelBefore: 1, levelAfter: 1, recordsXp: 0, achievementsXp: 0, records } as unknown as FinishMeta,
    xpEarned: 120,
    userXp: 120,
    hideWeights: false,
    finishedAt: new Date("2026-10-27T15:00:00Z"),
    timeZone: "Europe/Moscow",
    nickname: "Атлет",
    ...patch,
  };
}

describe("recordCards", () => {
  it("weight: result, change and the previous record", () => {
    const [card] = recordCards(input([rec("Жим лёжа", "MAX_WEIGHT", 100, 105)]));
    expect(card).toMatchObject({
      exercise: "Жим лёжа",
      label: "Максимальный вес",
      value: `105${NB}кг`,
      change: `+5${NB}кг к прошлому рекорду`,
      previous: `Было 100${NB}кг`,
      date: "27 октября",
      nickname: "Атлет",
    });
    expect(card.level).toBeGreaterThanOrEqual(1);
  });

  it("one card per exercise: weight beats 1RM and reps", () => {
    const cards = recordCards(
      input([rec("Присед", "MAX_REPS", 8, 10), rec("Присед", "ONE_RM", 120, 125.5), rec("Присед", "MAX_WEIGHT", 100, 102.5), rec("Тяга", "MAX_REPS", 5, 6)]),
    );
    expect(cards.map((c) => [c.exercise, c.value])).toEqual([
      ["Присед", `102,5${NB}кг`],
      ["Тяга", "6 повт."],
    ]);
    expect(cards[0].change).toBe(`+2,5${NB}кг к прошлому рекорду`);
  });

  it("reps and 1RM", () => {
    expect(recordCards(input([rec("Подтягивания", "MAX_REPS", 10, 12)]))[0]).toMatchObject({
      label: "Максимум повторов",
      value: "12 повт.",
      change: "+2 повт. к прошлому рекорду",
      previous: "Было 10 повт.",
    });
    expect(recordCards(input([rec("Жим", "ONE_RM", 110, 112.5)]))[0]).toMatchObject({ label: "1ПМ (расчётный)", value: `112,5${NB}кг` });
  });

  it("hidden weights: no kilograms, change in percent, reps first", () => {
    const [weight] = recordCards(input([rec("Жим лёжа", "MAX_WEIGHT", 100, 105)], { hideWeights: true }));
    expect(weight).toMatchObject({ value: "Новый рекорд", change: `+5${NB}% к прошлому рекорду`, previous: null });
    expect(JSON.stringify(weight)).not.toMatch(/кг/);
    const [both] = recordCards(input([rec("Присед", "MAX_WEIGHT", 100, 110), rec("Присед", "MAX_REPS", 8, 9)], { hideWeights: true }));
    expect(both.value).toBe("9 повт.");
  });

  it("timed records: longer, farther and a faster pace (lower is better)", () => {
    expect(recordCards(input([rec("Планка", "MAX_DURATION", 60, 75)]))[0]).toMatchObject({
      value: formatRecord("MAX_DURATION", 75),
      change: `+${formatRecord("MAX_DURATION", 15)} к прошлому рекорду`,
      previous: `Было ${formatRecord("MAX_DURATION", 60)}`,
    });
    expect(recordCards(input([rec("Бег", "MAX_DISTANCE", 5000, 5500)]))[0].change).toBe(`+${formatRecord("MAX_DISTANCE", 500)} к прошлому рекорду`);
    expect(recordCards(input([rec("Бег 5 км", "BEST_PACE", 330, 318)]))[0]).toMatchObject({
      label: "Лучший темп",
      value: formatRecord("BEST_PACE", 318),
      change: `−${formatRecord("BEST_PACE", 12)} к прошлому рекорду`,
    });
  });

  it("level after the workout; nothing without records or meta", () => {
    expect(recordCards(input([rec("Жим", "MAX_WEIGHT", 100, 105)], { xpEarned: 100_000 }))[0].level).toBeGreaterThan(1);
    expect(recordCards(input([]))).toEqual([]);
    expect(recordCards(input([], { meta: undefined }))).toEqual([]);
  });
});
