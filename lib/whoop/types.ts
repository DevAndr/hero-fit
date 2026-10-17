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
