/**
 * Виды упражнений: силовые (вес × повторы), на время (подход — секунды), кардио (время + дистанция)
 * и растяжка (подход — секунды удержания, ведёт себя как «на время»).
 * Подход на время и кардио хранит reps = 0, weight = 0; состоялся — durationSec > 0.
 */
export type ExerciseKindName = "REPS" | "TIME" | "CARDIO" | "STRETCH";

export const isTimed = (kind: ExerciseKindName | undefined) => kind === "TIME" || kind === "CARDIO" || kind === "STRETCH";

export const isStretch = (kind: ExerciseKindName | undefined) => kind === "STRETCH";

/** Подход выполнен и с результатом: силовой — с повторами, на время и кардио — со временем. */
export function isDoneSet(kind: ExerciseKindName | undefined, s: { reps: number; durationSec?: number | null; completedAt: unknown }) {
  if (!s.completedAt) return false;
  return isTimed(kind) ? (s.durationSec ?? 0) > 0 : s.reps > 0;
}

/**
 * Сессия растяжки: есть выполненные подходы, и все упражнения с выполненными подходами — растяжка
 * (силовые без отмеченных подходов при завершении удаляются и не мешают).
 */
export function isStretchOnly(
  exercises: { kind: ExerciseKindName; sets: { reps: number; durationSec?: number | null; completedAt: unknown }[] }[],
): boolean {
  const withDone = exercises.filter((e) => e.sets.some((s) => isDoneSet(e.kind, s)));
  return withDone.length > 0 && withDone.every((e) => e.kind === "STRETCH");
}

/**
 * «1:30» → 90, «90» → 90, «1:02:05» → 3725; мусор (и секунды/минуты ≥ 60 в частях) → 0.
 * Запятая и точка — тоже разделитель («1,30»): на цифровой клавиатуре телефона нет двоеточия.
 * Одна цифра после запятой или точки — доля минуты: «1,5» — 1:30, а не 1:05.
 */
export function parseClock(value: string, opts: { bareMinutes?: boolean } = {}): number {
  const parts = value.trim().split(/[:.,]/);
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return 0;
  const nums = parts.map(Number);
  // Кардио: «30» — полчаса, а не 30 секунд (иначе темп «0:06/км» навсегда в рекордах)
  if (nums.length === 1) return opts.bareMinutes ? nums[0] * 60 : nums[0];
  if (nums.length === 2 && parts[1].length === 1 && !value.includes(":")) return nums[0] * 60 + nums[1] * 6;
  if (nums.slice(1).some((n) => n >= 60)) return 0;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 90 → «1:30», 3725 → «1:02:05». */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Темп «5:31/км» — только при дистанции от 1 км. */
export function formatPace(sec: number, m: number): string | null {
  if (m < 1000 || sec <= 0) return null;
  return `${formatClock(sec / (m / 1000))}/км`;
}

/** 5200 → «5,2 км». */
export function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} км`;
}

/**
 * Подпись подхода на время / кардио: «1:30»; «5,2 км · 28:40 · 5:31/км»; без дистанции — только время.
 * Растяжка: «45 с» до минуты, дальше «1:30»; для одностороннего (`perSide`) — « × 2».
 */
export function timedSetText(kind: ExerciseKindName, s: { durationSec?: number | null; distanceM?: number | null }, perSide = false): string {
  if (kind === "STRETCH") {
    const sec = s.durationSec ?? 0;
    return `${sec < 60 ? `${sec} с` : formatClock(sec)}${perSide ? " × 2" : ""}`;
  }
  const time = formatClock(s.durationSec ?? 0);
  if (kind !== "CARDIO" || !s.distanceM) return time;
  const pace = formatPace(s.durationSec ?? 0, s.distanceM);
  return [formatKm(s.distanceM), time, pace].filter(Boolean).join(" · ");
}

/** График кардио — по дистанции, если она хоть раз была; иначе (скакалка, на время) — по времени. */
export function chartsDistance(kind: ExerciseKindName, sessions: { sets: { distanceM?: number | null }[] }[]) {
  return kind === "CARDIO" && sessions.some((s) => s.sets.some((x) => (x.distanceM ?? 0) > 0));
}

type TimedSet = { weight: number; reps: number; durationSec: number | null; distanceM: number | null };

/** Подходы упражнения на время / кардио при старте: время и дистанция «как в прошлый раз», без веса и повторов. */
export function plannedTimedSets(count: number, last: { durationSec?: number | null; distanceM?: number | null }[]): TimedSet[] {
  return Array.from({ length: count }, (_, i) => {
    const prev = last[i] ?? last.at(-1);
    return { weight: 0, reps: 0, durationSec: prev?.durationSec ?? null, distanceM: prev?.distanceM ?? null };
  });
}
