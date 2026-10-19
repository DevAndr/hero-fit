/** Силовые коэффициенты для пауэрлифтинга: DOTS и Wilks. Чистые функции, формула `total × 500 / полином(вес тела)`. */
export type Sex = "male" | "female";

export type DotsLevel = "Начинающий" | "Любитель" | "Продвинутый" | "Мастер" | "Элита";

const DOTS_COEF: Record<Sex, number[]> = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
};
const DOTS_RANGE: Record<Sex, [number, number]> = { male: [40, 210], female: [40, 150] };

const WILKS_COEF: Record<Sex, number[]> = {
  male: [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8],
  female: [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8],
};
const WILKS_RANGE: Record<Sex, [number, number]> = { male: [40, 201.9], female: [26.51, 154.53] };

/** Полином a + b·x + c·x² + … по схеме Горнера. */
function poly(coef: number[], x: number): number {
  return coef.reduceRight((acc, c) => acc * x + c, 0);
}

function score(total: number, bodyweight: number, sex: Sex, coef: Record<Sex, number[]>, range: Record<Sex, [number, number]>): number {
  if (!Number.isFinite(total) || !Number.isFinite(bodyweight) || total <= 0 || bodyweight <= 0) return 0;
  const [min, max] = range[sex];
  const bw = Math.min(max, Math.max(min, bodyweight));
  return (total * 500) / poly(coef[sex], bw);
}

export function dots(total: number, bodyweight: number, sex: Sex): number {
  return score(total, bodyweight, sex, DOTS_COEF, DOTS_RANGE);
}

export function wilks(total: number, bodyweight: number, sex: Sex): number {
  return score(total, bodyweight, sex, WILKS_COEF, WILKS_RANGE);
}

/** Ориентировочная шкала уровней по DOTS. */
export function dotsLevel(score: number): DotsLevel {
  if (score < 200) return "Начинающий";
  if (score < 300) return "Любитель";
  if (score < 400) return "Продвинутый";
  if (score < 500) return "Мастер";
  return "Элита";
}
