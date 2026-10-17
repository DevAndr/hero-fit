import type { WhoopWorkoutRow } from "./types";

export const MIN_OVERLAP_MS = 5 * 60_000;
export const MIN_OVERLAP_SHARE = 0.3;

export type WhoopSummary = {
  avgHr: number | null;
  maxHr: number | null;
  strain: number;
  kcal: number | null;
  zonesMs: number[];
  fragments: number;
};

export type WhoopMatch = { kind: "data"; summary: WhoopSummary } | { kind: "pending" } | null;

export function matchWhoop(
  workout: { startedAt: Date; finishedAt: Date },
  candidates: WhoopWorkoutRow[],
): WhoopMatch {
  const from = workout.startedAt.getTime();
  const to = workout.finishedAt.getTime();
  if (to <= from) return null;

  const fits = candidates.filter((c) => {
    const s = c.start.getTime();
    const e = c.end.getTime();
    const overlap = Math.max(0, Math.min(e, to) - Math.max(s, from));
    if (overlap <= 0) return false;
    return overlap >= MIN_OVERLAP_MS || overlap >= MIN_OVERLAP_SHARE * (e - s);
  });

  const scored = fits.filter((c) => c.scoreState === "SCORED");
  if (scored.length === 0) {
    return fits.some((c) => c.scoreState === "PENDING_SCORE") ? { kind: "pending" } : null;
  }

  let hrWeight = 0;
  let hrSum = 0;
  let maxHr: number | null = null;
  let kj: number | null = null;
  let strain = 0;
  const zonesMs = [0, 0, 0, 0, 0, 0];
  for (const c of scored) {
    if (c.avgHr !== null) {
      const d = c.end.getTime() - c.start.getTime();
      hrWeight += d;
      hrSum += c.avgHr * d;
    }
    if (c.maxHr !== null) maxHr = maxHr === null ? c.maxHr : Math.max(maxHr, c.maxHr);
    if (c.kilojoule !== null) kj = (kj ?? 0) + c.kilojoule;
    if (c.strain !== null) strain = Math.max(strain, c.strain);
    c.zonesMs.forEach((v, idx) => {
      if (idx < 6) zonesMs[idx] += v;
    });
  }

  return {
    kind: "data",
    summary: {
      avgHr: hrWeight > 0 ? Math.round(hrSum / hrWeight) : null,
      maxHr,
      strain,
      kcal: kj === null ? null : Math.round(kj / 4.184),
      zonesMs,
      fragments: scored.length,
    },
  };
}
