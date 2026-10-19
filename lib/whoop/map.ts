import type {
  WhoopApiRecovery,
  WhoopApiSleep,
  WhoopApiWorkout,
  WhoopRecoveryRow,
  WhoopScoreState,
  WhoopSleepRow,
  WhoopWorkoutRow,
} from "./types";

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

const scoreStateOf = (v: unknown): WhoopScoreState =>
  (typeof v === "string" && STATES.includes(v) ? v : "UNSCORABLE") as WhoopScoreState;

/** Сумма: хоть одно слагаемое не число — null (неполную сумму за правду не выдаём). */
function sum(parts: unknown[]): number | null {
  let total = 0;
  for (const p of parts) {
    const n = num(p);
    if (n === null) return null;
    total += n;
  }
  return Math.round(total);
}

/** Сон WHOOP → строка БД; дневной сон, нет id, битый end или cycle_id — null (запись пропускается). */
export function toWhoopSleep(s: WhoopApiSleep): WhoopSleepRow | null {
  if (!s || typeof s !== "object" || s.nap === true) return null;
  const start = date(s.start);
  const end = date(s.end);
  const cycle = num(s.cycle_id);
  if (typeof s.id !== "string" || !s.id || !start || !end || cycle === null) return null;
  const sc = s.score && typeof s.score === "object" ? s.score : undefined;
  const st = sc?.stage_summary && typeof sc.stage_summary === "object" ? sc.stage_summary : undefined;
  const need = sc?.sleep_needed && typeof sc.sleep_needed === "object" ? sc.sleep_needed : undefined;
  return {
    id: s.id,
    cycleId: String(cycle),
    start,
    end,
    sleepScoreState: scoreStateOf(s.score_state),
    sleepMs: sc ? sum([st?.total_light_sleep_time_milli, st?.total_slow_wave_sleep_time_milli, st?.total_rem_sleep_time_milli]) : null,
    needMs: sc
      ? sum([need?.baseline_milli, need?.need_from_sleep_debt_milli, need?.need_from_recent_strain_milli, need?.need_from_recent_nap_milli])
      : null,
    performancePct: sc ? int(sc.sleep_performance_percentage) : null,
  };
}

/** Восстановление WHOOP → поля сна; нет sleep_id — null. */
export function toWhoopRecovery(r: WhoopApiRecovery): WhoopRecoveryRow | null {
  if (!r || typeof r !== "object") return null;
  if (typeof r.sleep_id !== "string" || !r.sleep_id) return null;
  const sc = r.score && typeof r.score === "object" ? r.score : undefined;
  return {
    sleepId: r.sleep_id,
    recoveryScoreState: scoreStateOf(r.score_state),
    recoveryPct: sc ? int(sc.recovery_score) : null,
    restingHr: sc ? int(sc.resting_heart_rate) : null,
    hrvMs: sc ? num(sc.hrv_rmssd_milli) : null,
    calibrating: sc?.user_calibrating === true,
  };
}
