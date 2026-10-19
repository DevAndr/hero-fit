import { describe, expect, it } from "vitest";
import { BUILTIN_PROGRAMS, programBySlug, seedDays } from "./builtin";

type Ex = [string, number, number][];

// Существующие программы: значения как в прежнем prisma/seed.ts — менять нельзя (дубли на проде).
const EXISTING: Record<string, { program: string; days: { name: string; exercises: Ex }[] }> = {
  "push-pull-legs": {
    program: "Push / Pull / Legs",
    days: [
      {
        name: "Push",
        exercises: [
          ["Жим штанги лёжа", 4, 8],
          ["Жим гантелей на наклонной скамье", 3, 10],
          ["Жим штанги стоя", 3, 8],
          ["Махи гантелями в стороны", 3, 15],
          ["Разгибание рук на блоке", 3, 12],
        ],
      },
      {
        name: "Pull",
        exercises: [
          ["Становая тяга", 3, 5],
          ["Подтягивания", 4, 8],
          ["Тяга штанги в наклоне", 3, 10],
          ["Тяга к лицу", 3, 15],
          ["Подъём штанги на бицепс", 3, 12],
          ["Шраги со штангой", 3, 12],
        ],
      },
      {
        name: "Legs",
        exercises: [
          ["Приседания со штангой", 4, 8],
          ["Румынская тяга", 3, 10],
          ["Жим ногами", 3, 12],
          ["Выпады с гантелями", 3, 10],
          ["Подъём на носки стоя", 4, 15],
          ["Подъём ног в висе", 3, 12],
        ],
      },
    ],
  },
  "full-body": {
    program: "Full Body",
    days: [
      {
        name: "Full Body",
        exercises: [
          ["Приседания со штангой", 3, 8],
          ["Жим штанги лёжа", 3, 8],
          ["Тяга штанги в наклоне", 3, 8],
          ["Жим штанги стоя", 3, 10],
          ["Скручивания", 3, 15],
        ],
      },
    ],
  },
  "5x5": {
    program: "5×5",
    days: [
      {
        name: "5×5 — день A",
        exercises: [
          ["Приседания со штангой", 5, 5],
          ["Жим штанги лёжа", 5, 5],
          ["Тяга штанги в наклоне", 5, 5],
        ],
      },
      {
        name: "5×5 — день B",
        exercises: [
          ["Приседания со штангой", 5, 5],
          ["Жим штанги стоя", 5, 5],
          ["Становая тяга", 1, 5],
        ],
      },
    ],
  },
};

describe("BUILTIN_PROGRAMS", () => {
  it("slug уникальны, из [a-z0-9-], набор фиксирован", () => {
    const slugs = BUILTIN_PROGRAMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
    expect([...slugs].sort()).toEqual(["5x5", "beginner", "full-body", "push-pull-legs", "upper-lower"]);
  });

  it("programBySlug", () => {
    expect(programBySlug("5x5")?.program).toBe("5×5");
    expect(programBySlug("nope")).toBeNull();
  });

  it("дни и упражнения корректны", () => {
    for (const p of BUILTIN_PROGRAMS) {
      expect(p.days.length).toBeGreaterThanOrEqual(1);
      for (const d of p.days) {
        expect(d.exercises.length).toBeGreaterThanOrEqual(1);
        for (const [, sets, reps] of d.exercises) {
          expect(sets).toBeGreaterThan(0);
          expect(reps).toBeGreaterThan(0);
        }
      }
    }
  });

  it("тексты", () => {
    for (const p of BUILTIN_PROGRAMS) {
      expect(p.faq.length).toBeGreaterThanOrEqual(4);
      expect(p.description.length).toBeLessThanOrEqual(160);
      expect(p.forWhom.length).toBeGreaterThanOrEqual(3);
      expect(p.forWhom.length).toBeLessThanOrEqual(4);
      expect(p.schedule.length).toBeGreaterThanOrEqual(1);
      expect(p.progression).toContain("Пора увеличить вес");
    }
  });

  it("существующие программы не изменились", () => {
    for (const [slug, exp] of Object.entries(EXISTING)) {
      const p = programBySlug(slug)!;
      expect(p.program).toBe(exp.program);
      expect(p.days.map((d) => d.name)).toEqual(exp.days.map((d) => d.name));
      p.days.forEach((d, i) => expect(d.exercises).toEqual(exp.days[i].exercises));
    }
  });

  it("новые программы: имена дней", () => {
    expect(programBySlug("upper-lower")?.program).toBe("Верх / Низ");
    expect(programBySlug("upper-lower")?.days.map((d) => d.name)).toEqual(["Верх", "Низ"]);
    expect(programBySlug("beginner")?.program).toBe("Для новичка");
    expect(programBySlug("beginner")?.days.map((d) => d.name)).toEqual([
      "Новичок — день A",
      "Новичок — день B",
    ]);
  });
});

describe("seedDays", () => {
  it("10 дней, пары program+name уникальны", () => {
    const days = seedDays();
    expect(days).toHaveLength(10);
    const keys = days.map((d) => `${d.program}|${d.name}`);
    expect(new Set(keys).size).toBe(10);
    expect(days[0]).toMatchObject({ program: "Push / Pull / Legs", name: "Push" });
  });
});
