/** Калькулятор блинов и разминки для штанги. Чистые функции — используются в редакторе тренировки. */

export const BAR_KG = 20;
/** Стандартные блины (кг) — от тяжёлого к лёгкому. */
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

const EPS = 1e-9;
const round = (n: number) => Math.round(n * 100) / 100;

export type PlateLoad = {
  /** Блины на одну сторону, от тяжёлого к лёгкому. */
  perSide: number[];
  /** Сколько реально получится (может быть меньше цели, если её не набрать блинами). */
  total: number;
  exact: boolean;
};

/**
 * Что вешать на каждую сторону, чтобы набрать `target` кг. Жадный подбор — для стандартного набора он оптимален.
 * null — если цель не больше грифа (вешать нечего).
 */
export function platesFor(target: number, bar = BAR_KG, plates = PLATES_KG): PlateLoad | null {
  if (!(target > bar + EPS)) return null;
  let side = (target - bar) / 2;
  const perSide: number[] = [];
  for (const plate of plates) {
    while (side + EPS >= plate) {
      perSide.push(plate);
      side -= plate;
    }
  }
  const total = round(bar + 2 * perSide.reduce((s, p) => s + p, 0));
  return { perSide, total, exact: Math.abs(total - target) < 0.01 };
}

/** Классическая разминка: пустой гриф × 10, затем 40 % × 5, 60 % × 3, 80 % × 2 от рабочего веса. */
const WARMUP_STEPS = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 2 },
];
/** Ниже этого рабочего веса разминка подходами не нужна. */
export const WARMUP_MIN_KG = 40;

export function warmupSets(work: number, bar = BAR_KG): { weight: number; reps: number }[] {
  if (!(work >= WARMUP_MIN_KG)) return [];
  const sets = [{ weight: bar, reps: 10 }];
  for (const { pct, reps } of WARMUP_STEPS) {
    // Вниз до 2,5 кг — то, что реально собрать блинами по 1,25 на сторону
    const weight = Math.floor((work * pct) / 2.5) * 2.5;
    if (weight > sets.at(-1)!.weight + EPS && weight < work - EPS) sets.push({ weight, reps });
  }
  return sets;
}
