/**
 * Отсчёт удержания растяжки («Держать»). Источник правды — моменты окончания фаз (`endsAt`), а не тики:
 * вкладка в фоне может «уснуть», но состояние всегда считается от часов.
 * Односторонняя растяжка — две фазы (первая и вторая сторона) с паузой 5 с между ними.
 */

export const HOLD_DEFAULT_SEC = 30;
export const HOLD_PAUSE_MS = 5000;
/** «Стоп» раньше этого — удержание не засчитывается. */
export const HOLD_MIN_SEC = 5;

export type HoldSide = "first" | "second" | null;
export type HoldRun = { startedAt: number; phases: { side: HoldSide; endsAt: number }[]; pauseMs: typeof HOLD_PAUSE_MS };
export type HoldState = { phase: number; leftSec: number; pausing: boolean; done: boolean };

/** Сколько держать: введённое в подходе → прошлое → 30 с. */
export function holdTarget(set: { durationSec: number | null }, prev: number | null): number {
  if (set.durationSec && set.durationSec > 0) return set.durationSec;
  if (prev && prev > 0) return prev;
  return HOLD_DEFAULT_SEC;
}

export function startHold(now: number, sec: number, perSide: boolean): HoldRun {
  const ms = sec * 1000;
  const phases = perSide
    ? [
        { side: "first" as const, endsAt: now + ms },
        { side: "second" as const, endsAt: now + ms + HOLD_PAUSE_MS + ms },
      ]
    : [{ side: null, endsAt: now + ms }];
  return { startedAt: now, phases, pauseMs: HOLD_PAUSE_MS };
}

const phaseStart = (run: HoldRun, i: number) => (i === 0 ? run.startedAt : run.phases[i - 1].endsAt + run.pauseMs);

export function holdState(run: HoldRun, now: number): HoldState {
  const i = run.phases.findIndex((p) => now < p.endsAt);
  if (i < 0) return { phase: run.phases.length - 1, leftSec: 0, pausing: false, done: true };
  const start = phaseStart(run, i);
  if (now < start) return { phase: i, leftSec: Math.ceil((start - now) / 1000), pausing: true, done: false };
  return { phase: i, leftSec: Math.ceil((run.phases[i].endsAt - now) / 1000), pausing: false, done: false };
}

/**
 * Фактически удержанное за текущую сторону (целые секунды, не больше цели); `null` — меньше 5 с.
 * Вторая сторона раньше 5 с — засчитывается первая, удержанная целиком (подход не пропадает).
 */
export function stoppedSec(run: HoldRun, now: number): number | null {
  const target = Math.round((run.phases[0].endsAt - run.startedAt) / 1000);
  const state = holdState(run, now);
  // В паузе предыдущая сторона уже удержана целиком
  const held = state.done || state.pausing ? target : Math.min(target, Math.floor((now - phaseStart(run, state.phase)) / 1000));
  if (held >= HOLD_MIN_SEC) return held;
  return state.phase > 0 ? target : null;
}

/** Отсчёт действует, только пока его подход есть и не отмечен: удалили или отметили ✓ вручную — отсчёта нет. */
export function activeHold<H extends { setKey: string }>(hold: H | null, sets: { key: string; completedAt: unknown }[]): H | null {
  if (!hold) return null;
  const set = sets.find((s) => s.key === hold.setKey);
  return set && !set.completedAt ? hold : null;
}
