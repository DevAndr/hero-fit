import type { MuscleGroup } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { addWeeks, STREAK_WEEK_TARGET } from "@/lib/progress/weekly-streak";
import { epley1RM } from "@/lib/progress/records";
import { rankLeague } from "@/lib/social/league";
import { RECAP_VERSION, type RecapData, type RecapInput, type RecapTotals } from "./types";

const EPS = 0.01;

function sumTotals(rows: { minutes: number; volume: number; sets: number }[]): RecapTotals {
  const zero: RecapTotals = { workouts: 0, minutes: 0, volume: 0, sets: 0 };
  return rows.reduce<RecapTotals>(
    (t, r) => ({ workouts: t.workouts + 1, minutes: t.minutes + r.minutes, volume: t.volume + r.volume, sets: t.sets + r.sets }),
    zero,
  );
}

function league(input: RecapInput): RecapData["league"] {
  if (input.league) {
    const ranked = rankLeague(
      input.league.members.map((m) => ({ ...m, level: 0, streak: 0 })),
      input.league.meId,
    );
    const meIndex = ranked.findIndex((m) => m.me);
    if (meIndex < 0) return undefined;
    // Топ-3 и я с соседями по таблице — без повторов, в порядке таблицы
    const shown = ranked.filter((_, i) => i < 3 || Math.abs(i - meIndex) <= 1);
    const me = ranked[meIndex];
    return {
      place: me.place,
      of: ranked.length,
      xp: me.xp,
      rows: shown.map(({ nickname, xp, place, me }) => ({ nickname, xp, place, me })),
    };
  }
  if (input.percentile.value === null) return undefined;
  return { percentile: input.percentile.value, xp: input.percentile.xp };
}

/** Лучший подход: максимум e1RM по Эпли (при равенстве — больший вес); упражнения со своим весом — по повторам, если весовых не было. */
function bestSet(input: RecapInput): RecapData["bestSet"] {
  const weighted = input.sets.filter((s) => !s.isBodyweight && s.weight > 0 && s.reps > 0);
  const prs = input.finishMetas.flatMap((m) => m.records);
  if (weighted.length) {
    let best = weighted[0];
    let bestE1rm = epley1RM(best.weight, best.reps);
    for (const s of weighted.slice(1)) {
      const e = epley1RM(s.weight, s.reps);
      if (e > bestE1rm + 1e-9 || (Math.abs(e - bestE1rm) <= 1e-9 && s.weight > best.weight)) {
        best = s;
        bestE1rm = e;
      }
    }
    const isRecord = prs.some(
      (r) =>
        r.exerciseId === best.exerciseId &&
        ((r.type === "ONE_RM" && Math.abs(r.value - bestE1rm) < EPS) || (r.type === "MAX_WEIGHT" && r.value === best.weight)),
    );
    return { exerciseId: best.exerciseId, exerciseName: best.exerciseName, weight: best.weight, reps: best.reps, e1rm: bestE1rm, isRecord };
  }
  const bodyweight = input.sets.filter((s) => s.isBodyweight && s.reps > 0);
  if (!bodyweight.length) return undefined;
  const best = bodyweight.reduce((a, b) => (b.reps > a.reps ? b : a));
  const isRecord = prs.some((r) => r.exerciseId === best.exerciseId && r.type === "MAX_REPS" && r.value === best.reps);
  return { exerciseId: best.exerciseId, exerciseName: best.exerciseName, weight: 0, reps: best.reps, e1rm: null, isRecord };
}

function streak(input: RecapInput): RecapData["streak"] {
  const last = input.finishMetas.at(-1);
  if (!last) return undefined;
  return {
    weekCount: last.weekCount,
    target: STREAK_WEEK_TARGET,
    credited: last.weekCount >= STREAK_WEEK_TARGET,
    streak: input.currentStreak,
    frozen: input.coveredByFreeze,
  };
}

function records(input: RecapInput): RecapData["records"] {
  const prs = input.finishMetas.flatMap((m) => m.records).map(({ exerciseId, exerciseName, type, value }) => ({ exerciseId, exerciseName, type, value }));
  const first = input.finishMetas[0];
  const last = input.finishMetas.at(-1);
  const level = first && last && last.levelAfter > first.levelBefore ? { from: first.levelBefore, to: last.levelAfter } : null;
  if (!prs.length && !input.achievements.length && !level) return undefined;
  return { prs, achievements: input.achievements, level };
}

/** Группы этой недели и «забытая»: 0 подходов эту и прошлую неделю, но были за 4 недели до этого. */
function muscles(input: RecapInput): RecapData["muscles"] {
  const setsIn = (weeks: string[]) => {
    const by = new Map<MuscleGroup, number>();
    for (const r of input.muscleSets) if (weeks.includes(r.week)) by.set(r.group, (by.get(r.group) ?? 0) + r.sets);
    return by;
  };
  const current = setsIn([input.week]);
  const groups = [...current]
    .filter(([, sets]) => sets > 0)
    .map(([group, sets]) => ({ group, sets }))
    .sort((a, b) => b.sets - a.sets);
  if (!groups.length) return undefined;

  const recent = setsIn([input.week, addWeeks(input.week, -1)]);
  const before = setsIn([2, 3, 4, 5].map((n) => addWeeks(input.week, -n)));
  let forgotten: MuscleGroup | null = null;
  let forgottenSets = 0;
  for (const [group, sets] of before) {
    if ((recent.get(group) ?? 0) === 0 && sets > forgottenSets) {
      forgotten = group;
      forgottenSets = sets;
    }
  }
  return { groups, forgotten };
}

/** Итоги недели из собранных данных; null — в неделе не было тренировок. */
export function buildRecap(input: RecapInput): RecapData | null {
  if (!input.workouts.length) return null;
  const data: RecapData = {
    version: RECAP_VERSION,
    week: input.week,
    totals: { ...sumTotals(input.workouts), prev: input.prevWorkouts.length ? sumTotals(input.prevWorkouts) : null },
  };
  const blocks = {
    league: league(input),
    bestSet: bestSet(input),
    streak: streak(input),
    records: records(input),
    muscles: muscles(input),
    plan: input.plan ?? undefined,
  };
  for (const [key, value] of Object.entries(blocks)) if (value !== undefined) Object.assign(data, { [key]: value });
  return data;
}

const formatKg = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Самое яркое за неделю — 2–3 факта по приоритету: место в лиге → рост → лучший подход → засчитанная неделя. */
export function recapHighlights(data: RecapData): string[] {
  const facts: string[] = [];
  if (data.league && "place" in data.league && data.league.of >= 2) facts.push(`${data.league.place}-е место в лиге`);
  const { totals } = data;
  if (totals.prev) {
    if (totals.prev.volume > 0 && totals.volume > totals.prev.volume) {
      facts.push(`объём +${Math.round((totals.volume / totals.prev.volume - 1) * 100)}%`);
    } else if (totals.workouts > totals.prev.workouts) {
      facts.push(`тренировок +${totals.workouts - totals.prev.workouts}`);
    }
  }
  if (data.bestSet) {
    const { exerciseName, weight, reps } = data.bestSet;
    facts.push(`лучший подход: ${exerciseName} ${weight > 0 ? `${formatKg(weight)}×${reps}` : `×${reps}`}`);
  }
  if (data.streak?.credited) facts.push("неделя засчитана 🔥");
  if (!facts.length) facts.push(`${totals.workouts} ${plural(totals.workouts, "тренировка", "тренировки", "тренировок")} за неделю`);
  return facts.slice(0, 3);
}

/** Текст push «Итоги недели». */
export function recapPushBody(data: RecapData): string {
  return recapHighlights(data).join(" · ");
}
