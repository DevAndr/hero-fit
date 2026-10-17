import type { WhoopApiWorkout, WhoopScoreState, WhoopWorkoutRow } from "./types";

const STATES: readonly string[] = ["SCORED", "PENDING_SCORE", "UNSCORABLE"];

export function toWhoopWorkout(w: WhoopApiWorkout): WhoopWorkoutRow {
  const scoreState = (STATES.includes(w.score_state) ? w.score_state : "UNSCORABLE") as WhoopScoreState;
  const s = w.score;
  const z = s?.zone_durations;
  return {
    id: w.id,
    start: new Date(w.start),
    end: new Date(w.end),
    sportName: w.sport_name,
    scoreState,
    strain: s ? s.strain : null,
    avgHr: s ? s.average_heart_rate : null,
    maxHr: s ? s.max_heart_rate : null,
    kilojoule: s ? s.kilojoule : null,
    zonesMs: s
      ? [
          z?.zone_zero_milli ?? 0,
          z?.zone_one_milli ?? 0,
          z?.zone_two_milli ?? 0,
          z?.zone_three_milli ?? 0,
          z?.zone_four_milli ?? 0,
          z?.zone_five_milli ?? 0,
        ]
      : [],
  };
}
