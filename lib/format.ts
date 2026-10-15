/** 75 → «1:15», 3725 → «1:02:05». */
export function formatClock(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Длительность словами без секунд: 8 → «< 1 мин», 479 → «7 мин», 3900 → «1 ч 5 мин». */
export function formatDuration(totalSec: number) {
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 1) return "< 1 мин";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Запас повторов для подписи: 4 хранится как «4+». */
export const rirLabel = (rir: number) => (rir >= 4 ? "4+" : String(rir));

/** «100×5», «12» (свой вес) и «@RIR 2», если запас указан. */
export function formatSet(s: { weight: number; reps: number; rir?: number | null }) {
  const base = s.weight ? `${s.weight.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}×${s.reps}` : `${s.reps}`;
  return s.rir === null || s.rir === undefined ? base : `${base} @RIR ${rirLabel(s.rir)}`;
}

/** Форма слова по числу: plural(5, "неделя", "недели", "недель") → «недель». */
export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
