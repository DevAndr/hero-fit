import { describe, expect, it } from "vitest";
import { toWorkoutsCsv, type CsvSet } from "./csv";

const set = (o: Partial<CsvSet> = {}): CsvSet => ({
  finishedAt: new Date("2026-10-12T21:30:00Z"),
  workout: "Грудь",
  exercise: "Жим штанги лёжа",
  index: 1,
  warmup: false,
  weight: 62.5,
  reps: 8,
  rir: null,
  ...o,
});

describe("toWorkoutsCsv", () => {
  it("BOM, заголовок, ; и \r\n, десятичная запятая, пустой RIR, дата в поясе пользователя", () => {
    const csv = toWorkoutsCsv([set(), set({ index: 2, warmup: true, rir: 2, weight: null, reps: null })], "Europe/Moscow");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Дата;Тренировка;Упражнение;Подход;Разминка;Вес, кг;Повторы;RIR");
    expect(lines[1]).toBe("2026-10-13 00:30;Грудь;Жим штанги лёжа;1;нет;62,5;8;");
    expect(lines[2]).toBe("2026-10-13 00:30;Грудь;Жим штанги лёжа;2;да;;;2");
  });
  it("кавычки, ; и перевод строки — в кавычках", () => {
    const csv = toWorkoutsCsv([set({ exercise: 'Жим "узкий"; 2', workout: "день\nног" })], "UTC");
    expect(csv).toContain('"день\nног";"Жим ""узкий""; 2"');
  });
  it("формула из названия — с апострофом", () => {
    const csv = toWorkoutsCsv([set({ exercise: '=HYPERLINK("x")' })], "UTC");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(toWorkoutsCsv([set({ workout: "+1" })], "UTC")).toContain(";'+1;");
  });
});
