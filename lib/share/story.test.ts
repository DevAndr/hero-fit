import { describe, expect, it } from "vitest";
import type { FinishMeta } from "@/lib/workouts/finish";
import { storyData, type StoryInput } from "./story";

const meta = (over: Partial<FinishMeta> = {}): FinishMeta => ({
  xpBefore: 0,
  levelBefore: 1,
  levelAfter: 1,
  workoutXp: 80,
  recordsXp: 0,
  achievementsXp: 0,
  records: [],
  achievements: [],
  streak: 2,
  streakExtended: false,
  streakReset: false,
  usedFreezes: 0,
  weekCount: 2,
  ...over,
});

const input = (over: Partial<StoryInput> = {}): StoryInput => ({
  workoutName: "Full Body",
  finishedAt: new Date("2026-10-09T15:00:00Z"),
  durationSec: 58 * 60,
  totalVolume: 8400,
  totalSets: 15,
  xpEarned: 80,
  userXp: 500,
  meta: meta(),
  nickname: "iron_ivan",
  hideWeights: false,
  timeZone: "Europe/Moscow",
  ...over,
});

const record = (type: "ONE_RM" | "MAX_WEIGHT" | "MAX_REPS", exerciseName: string, value: number) => ({
  exerciseId: exerciseName,
  exerciseName,
  type,
  value,
  previous: 0,
});

describe("storyData", () => {
  it("основные цифры, дата в поясе пользователя, ник", () => {
    const d = storyData(input());
    expect(d.title).toBe("Full Body");
    expect(d.date).toBe("9 октября");
    expect(d.nickname).toBe("iron_ivan");
    expect(d.xpGained).toBe(80);
    expect(d.level).toBe(1);
    expect(d.leveledUp).toBe(false);
    expect(d.streak).toBe(2);
    expect(d.weekCount).toBe(2);
    expect(d.stats).toEqual(["58 мин", "8\u00a0400\u00a0кг", "15 подходов"]);
  });

  it("опыт и уровень — после тренировки, с ачивками; новый уровень", () => {
    const d = storyData(input({ xpEarned: 120, meta: meta({ xpBefore: 90, achievementsXp: 30, levelBefore: 1, levelAfter: 2 }) }));
    expect(d.xpGained).toBe(150);
    expect(d.level).toBe(2);
    expect(d.leveledUp).toBe(true);
  });

  it("рекорды: до трёх и «ещё N», значения по типу", () => {
    const d = storyData(
      input({
        meta: meta({
          records: [
            record("MAX_WEIGHT", "Жим штанги лёжа", 100),
            record("MAX_REPS", "Подтягивания", 12),
            record("ONE_RM", "Приседания со штангой", 142.5),
            record("MAX_WEIGHT", "Становая тяга", 180),
          ],
        }),
      }),
    );
    expect(d.records).toEqual([
      { exercise: "Жим штанги лёжа", value: "100\u00a0кг" },
      { exercise: "Подтягивания", value: "12 повт." },
      { exercise: "Приседания со штангой", value: "1ПМ 142,5\u00a0кг" },
    ]);
    expect(d.moreRecords).toBe(1);
  });

  it("несколько рекордов одного упражнения — одна строка: вес, иначе 1ПМ, иначе повторы", () => {
    const d = storyData(
      input({
        meta: meta({
          records: [
            record("MAX_REPS", "Приседания со штангой", 8),
            record("MAX_WEIGHT", "Приседания со штангой", 100),
            record("ONE_RM", "Приседания со штангой", 126.7),
            record("ONE_RM", "Жим штанги лёжа", 90),
            record("MAX_REPS", "Жим штанги лёжа", 10),
          ],
        }),
      }),
    );
    expect(d.records).toEqual([
      { exercise: "Приседания со штангой", value: "100 кг" },
      { exercise: "Жим штанги лёжа", value: "1ПМ 90 кг" },
    ]);
    expect(d.moreRecords).toBe(0);
  });

  it("«Скрыть веса» и рекорд по повторам в том же упражнении — показываем повторы", () => {
    const d = storyData(
      input({ hideWeights: true, meta: meta({ records: [record("MAX_WEIGHT", "Жим штанги лёжа", 100), record("MAX_REPS", "Жим штанги лёжа", 12)] }) }),
    );
    expect(d.records).toEqual([{ exercise: "Жим штанги лёжа", value: "12 повт." }]);
  });

  it("«Скрыть веса»: без объёма и килограммов в рекордах, повторы остаются", () => {
    const d = storyData(
      input({
        hideWeights: true,
        meta: meta({ records: [record("MAX_WEIGHT", "Жим штанги лёжа", 100), record("MAX_REPS", "Подтягивания", 12)] }),
      }),
    );
    expect(d.stats).toEqual(["58 мин", "15 подходов"]);
    expect(d.records).toEqual([
      { exercise: "Жим штанги лёжа", value: "новый рекорд" },
      { exercise: "Подтягивания", value: "12 повт." },
    ]);
  });

  it("босс: урон и остаток HP; победа этой тренировкой", () => {
    const boss = { week: "2026-10-05", code: "golem", damage: 350, crits: 1, hpBefore: 900, hpAfter: 550, hp: 1500, defeated: false };
    expect(storyData(input({ meta: meta({ boss }) })).boss).toEqual({
      code: "golem",
      name: "Железный Голем",
      damage: 350,
      hpLeft: 550,
      hp: 1500,
      defeated: false,
    });
    const won = storyData(input({ meta: meta({ boss: { ...boss, hpAfter: 0, defeated: true } }) })).boss;
    expect(won?.defeated).toBe(true);
  });

  it("без события завершения (старая тренировка): опыт из тренировки, без босса и рекордов", () => {
    const d = storyData(input({ meta: undefined, xpEarned: 70, userXp: 500 }));
    expect(d.xpGained).toBe(70);
    expect(d.boss).toBeNull();
    expect(d.records).toEqual([]);
    expect(d.weekCount).toBeNull();
  });

  it("тренировка короче минуты — «1 мин», не «0 мин»", () => {
    expect(storyData(input({ durationSec: 20 })).stats[0]).toBe("1 мин");
  });

  it("длинная тренировка — часы и минуты; один подход", () => {
    expect(storyData(input({ durationSec: 3900, totalSets: 1 })).stats).toEqual(["1 ч 05 мин", "8\u00a0400\u00a0кг", "1 подход"]);
  });
});
