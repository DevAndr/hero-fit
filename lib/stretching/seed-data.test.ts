import { describe, expect, it } from "vitest";
import { STRETCH_ZONES } from "./zones";
import { programSkill, STRETCH_PROGRAMS, STRETCH_SEED } from "./seed-data";

describe("STRETCH_SEED", () => {
  it("не меньше 18 упражнений, отдых 15 с", () => {
    expect(STRETCH_SEED.length).toBeGreaterThanOrEqual(18);
    for (const s of STRETCH_SEED) expect(s.restSec).toBe(15);
  });

  it("каждая зона — основная хотя бы у одного упражнения", () => {
    for (const z of STRETCH_ZONES) expect(STRETCH_SEED.some((s) => s.zones[0] === z)).toBe(true);
  });

  it("имена уникальны", () => {
    const names = STRETCH_SEED.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("не пересекаются с силовыми из сида", async () => {
    const src = (await import("node:fs")).readFileSync("prisma/seed.ts", "utf8");
    const strength = [...src.matchAll(/\{ name: "([^"]+)", muscleGroups/g)].map((m) => m[1]);
    expect(strength.length).toBeGreaterThan(50);
    for (const s of STRETCH_SEED) expect(strength).not.toContain(s.name);
  });

  it("односторонние упражнения помечены", () => {
    for (const n of ["Голубь", "Выпад на сгибатели бедра", "Растяжка квадрицепса стоя"]) {
      expect(STRETCH_SEED.find((s) => s.name === n)?.perSide).toBe(true);
    }
  });
});

describe("STRETCH_PROGRAMS", () => {
  it("четыре программы по 6–8 упражнений, все из каталога", () => {
    expect(STRETCH_PROGRAMS.map((p) => p.name)).toEqual(["Утренняя растяжка", "Заминка после силовой", "Шпагат: продольный", "Шпагат: поперечный"]);
    const names = new Set(STRETCH_SEED.map((s) => s.name));
    for (const p of STRETCH_PROGRAMS) {
      expect(p.exercises.length).toBeGreaterThanOrEqual(6);
      expect(p.exercises.length).toBeLessThanOrEqual(8);
      for (const [n, sets] of p.exercises) {
        expect(names.has(n)).toBe(true);
        expect([2, 3]).toContain(sets);
      }
    }
  });

  it("программы на шпагат ведут к цели-навыку и предупреждают о боли", () => {
    const skills = Object.fromEntries(STRETCH_PROGRAMS.map((p) => [p.name, p.skill ?? null]));
    expect(skills).toEqual({
      "Утренняя растяжка": null,
      "Заминка после силовой": null,
      "Шпагат: продольный": "SPLIT_LEFT",
      "Шпагат: поперечный": "SPLIT_SIDE",
    });
    for (const p of STRETCH_PROGRAMS.filter((x) => x.skill)) expect(p.description).toContain("не до боли");
  });
});

describe("programSkill", () => {
  it("навык встроенной программы по названию, у остальных — null", () => {
    expect(programSkill("Шпагат: поперечный")).toBe("SPLIT_SIDE");
    expect(programSkill("Утренняя растяжка")).toBeNull();
    expect(programSkill("Мой шпагат")).toBeNull();
  });
});
