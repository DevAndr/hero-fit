/** Диапазоны повторов: сила / гипертрофия / выносливость (общие для запроса и графика). */
export const REP_RANGES = [
  { key: "strength", label: "1–5", hint: "сила" },
  { key: "hypertrophy", label: "6–12", hint: "гипертрофия" },
  { key: "endurance", label: "13+", hint: "выносливость" },
] as const;
export type RepRangeKey = (typeof REP_RANGES)[number]["key"];
export type RepRangeRow = { key: RepRangeKey; month: number; all: number };
