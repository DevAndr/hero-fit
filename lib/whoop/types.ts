export type WhoopScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE";

export type WhoopWorkoutRow = {
  id: string;
  start: Date;
  end: Date;
  sportName: string;
  scoreState: WhoopScoreState;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  kilojoule: number | null;
  zonesMs: number[];
};

/** Форма ответа WHOOP API v2 (только используемые поля). */
export type WhoopApiWorkout = {
  id: string;
  start: string;
  end: string;
  sport_name: string;
  score_state: string;
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded?: number;
    zone_durations?: {
      zone_zero_milli?: number;
      zone_one_milli?: number;
      zone_two_milli?: number;
      zone_three_milli?: number;
      zone_four_milli?: number;
      zone_five_milli?: number;
    };
  };
};

export type WhoopSleepRow = {
  id: string;
  cycleId: string;
  start: Date;
  end: Date;
  sleepScoreState: WhoopScoreState;
  sleepMs: number | null;
  needMs: number | null;
  performancePct: number | null;
};

export type WhoopRecoveryRow = {
  sleepId: string;
  recoveryScoreState: WhoopScoreState;
  recoveryPct: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  calibrating: boolean;
};

/** Сон WHOOP API v2 (только используемые поля). */
export type WhoopApiSleep = {
  id: string;
  cycle_id: number;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary?: {
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
    sleep_performance_percentage?: number;
  };
};

/** Восстановление WHOOP API v2 (только используемые поля). */
export type WhoopApiRecovery = {
  cycle_id: number;
  sleep_id: string;
  score_state: string;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
  };
};
