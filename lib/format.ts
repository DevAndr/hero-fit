/** 75 → «1:15», 3725 → «1:02:05». */
export function formatClock(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Запас повторов для подписи: 4 хранится как «4+». */
export const rirLabel = (rir: number) => (rir >= 4 ? "4+" : String(rir));

/** «100×5», «12» (свой вес) и «@RIR 2», если запас указан. */
export function formatSet(s: { weight: number; reps: number; rir?: number | null }) {
  const base = s.weight ? `${s.weight.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}×${s.reps}` : `${s.reps}`;
  return s.rir === null || s.rir === undefined ? base : `${base} @RIR ${rirLabel(s.rir)}`;
}
