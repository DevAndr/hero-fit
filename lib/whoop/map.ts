import type { WhoopApiWorkout, WhoopScoreState, WhoopWorkoutRow } from "./types";

const STATES: readonly string[] = ["SCORED", "PENDING_SCORE", "UNSCORABLE"];

/** Конечное число или null: ответ WHOOP не доверяем — строка/NaN не должны дойти до Prisma (ошибка содержала бы значения). */
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Целое (пульс, мс в зоне) — колонки Int. */
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const date = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Активность WHOOP → строка БД; нет id или битые start/end — null (запись пропускается). */
export function toWhoopWorkout(w: WhoopApiWorkout): WhoopWorkoutRow | null {
  if (!w || typeof w !== "object") return null;
  const start = date(w.start);
  const end = date(w.end);
  if (typeof w.id !== "string" || !w.id || !start || !end) return null;
  const scoreState = (typeof w.score_state === "string" && STATES.includes(w.score_state) ? w.score_state : "UNSCORABLE") as WhoopScoreState;
  const s = w.score && typeof w.score === "object" ? w.score : undefined;
  const z = s?.zone_durations && typeof s.zone_durations === "object" ? s.zone_durations : undefined;
  return {
    id: w.id,
    start,
    end,
    sportName: typeof w.sport_name === "string" ? w.sport_name : "",
    scoreState,
    strain: s ? num(s.strain) : null,
    avgHr: s ? int(s.average_heart_rate) : null,
    maxHr: s ? int(s.max_heart_rate) : null,
    kilojoule: s ? num(s.kilojoule) : null,
    zonesMs: s
      ? [z?.zone_zero_milli, z?.zone_one_milli, z?.zone_two_milli, z?.zone_three_milli, z?.zone_four_milli, z?.zone_five_milli].map(
          (v) => int(v) ?? 0,
        )
      : [],
  };
}
