/** CSV «Тренировки» для выгрузки данных: подход — строка; открывается в Excel без мастера импорта (BOM, «;»). */

export type CsvSet = {
  finishedAt: Date;
  workout: string;
  exercise: string;
  index: number;
  warmup: boolean;
  weight: number | null;
  reps: number | null;
  rir: number | null;
};

const HEADER = ["Дата", "Тренировка", "Упражнение", "Подход", "Разминка", "Вес, кг", "Повторы", "RIR"];

/** RFC 4180 + защита от формул: ячейка с `= + - @` в начале — с апострофом (названия своих упражнений). */
function cell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const number = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export function toWorkoutsCsv(rows: CsvSet[], timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const lines = [HEADER.join(";")];
  for (const r of rows) {
    lines.push(
      [fmt.format(r.finishedAt), r.workout, r.exercise, String(r.index), r.warmup ? "да" : "нет", number(r.weight), number(r.reps), number(r.rir)]
        .map(cell)
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}`;
}
