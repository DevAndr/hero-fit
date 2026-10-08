import { describe, expect, it } from "vitest";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";
import type { GroupRecovery, RecoveryState } from "./recovery";
import { planRecoveryWorkout, recoveryWorkoutName, type PlanCandidate } from "./recovery-plan";

/** Все группы «устали», кроме заданных. */
const recovery = (states: Partial<Record<MuscleGroup, [RecoveryState, number | null]>>): GroupRecovery[] =>
  MUSCLE_GROUPS.map((group) => {
    const [state, daysSince] = states[group] ?? ["fatigued", 1];
    return { group, state, percent: state === "fatigued" ? 20 : 100, hoursLeft: 0, daysSince };
  });

let seq = 0;
const ex = (name: string, muscleGroups: MuscleGroup[], uses = 0): PlanCandidate => ({
  id: name,
  name,
  muscleGroups,
  uses,
  order: seq++,
  restSec: 90,
});

const BASE = [
  ex("Жим штанги лёжа", ["CHEST", "TRICEPS", "SHOULDERS"]),
  ex("Сведение рук в кроссовере", ["CHEST"]),
  ex("Подтягивания", ["BACK", "BICEPS"]),
  ex("Тяга штанги в наклоне", ["BACK", "BICEPS"]),
  ex("Тяга верхнего блока", ["BACK", "BICEPS"]),
  ex("Приседания со штангой", ["LEGS", "ABS"]),
  ex("Жим ногами", ["LEGS"]),
  ex("Махи гантелями в стороны", ["SHOULDERS"]),
  ex("Подъём на носки стоя", ["CALVES"]),
  ex("Скручивания", ["ABS"]),
];

describe("planRecoveryWorkout", () => {
  it("только готовые и давно не тренированные группы; первыми — дольше отдыхающие; крупным — по 2", () => {
    const plan = planRecoveryWorkout(
      // пресс и бицепс восстанавливаются: целью не станут, но второстепенными — можно
      recovery({ BACK: ["ready", 3], LEGS: ["neglected", 9], SHOULDERS: ["ready", 4], ABS: ["recovering", 1], BICEPS: ["recovering", 1] }),
      BASE,
    );
    expect(plan.groups).toEqual(["LEGS", "SHOULDERS", "BACK"]);
    expect(plan.exercises.map((e) => e.name)).toEqual([
      "Приседания со штангой",
      "Жим ногами",
      "Махи гантелями в стороны",
      "Подтягивания",
      "Тяга штанги в наклоне",
    ]);
  });

  it("упражнение с уставшей второстепенной группой не берём", () => {
    // грудь готова, но трицепс устал — жим лёжа пропускаем
    const plan = planRecoveryWorkout(recovery({ CHEST: ["ready", 3], SHOULDERS: ["ready", 3] }), BASE);
    expect(plan.exercises.map((e) => e.name)).toEqual(["Сведение рук в кроссовере", "Махи гантелями в стороны"]);
  });

  it("сначала частые из своей истории, потом справочник", () => {
    const own = [...BASE, ex("Тяга гантели одной рукой", ["BACK"], 5), ex("Тяга верхнего блока", ["BACK", "BICEPS"], 2)];
    const plan = planRecoveryWorkout(recovery({ BACK: ["ready", 3], BICEPS: ["ready", 3] }), own);
    expect(plan.exercises.slice(0, 2).map((e) => [e.name, e.uses])).toEqual([
      ["Тяга гантели одной рукой", 5],
      ["Тяга верхнего блока", 2],
    ]);
  });

  it("не больше 6 упражнений; пусто, если всё устало", () => {
    const all = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, ["neglected", null]])) as Parameters<typeof recovery>[0];
    expect(planRecoveryWorkout(recovery(all), BASE).exercises).toHaveLength(6);
    expect(planRecoveryWorkout(recovery({}), BASE)).toEqual({ groups: [], exercises: [] });
  });
});

describe("recoveryWorkoutName", () => {
  it("название по группам", () => {
    expect(recoveryWorkoutName(["LEGS", "BACK", "SHOULDERS"])).toBe("По восстановлению: ноги, спина, плечи");
  });
});
