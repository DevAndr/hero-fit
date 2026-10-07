/** Чистые преобразования рядов для графиков статистики (дни — «YYYY-MM-DD» в поясе пользователя). */

export type DayRow = { day: string; volume: number; workouts: number; sec: number; sets: number; prs: number };

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);

function addDays(day: string, n: number) {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

/** Понедельник недели, в которую попадает день. */
export function weekStart(day: string) {
  const dow = (toDate(day).getUTCDay() + 6) % 7; // 0 = понедельник
  return addDays(day, -dow);
}

export type WeekPoint = {
  week: string;
  volume: number;
  workouts: number;
  hours: number;
  sets: number;
  prs: number;
  /** Плотность: кг за минуту тренировки (0, если времени нет). */
  density: number;
};

/** `count` календарных недель подряд, заканчивая текущей; пустые недели — нули. */
export function weeklySeries(days: DayRow[], today: string, count: number): WeekPoint[] {
  const last = weekStart(today);
  const weeks = Array.from({ length: count }, (_, i) => addDays(last, -7 * (count - 1 - i)));
  const acc = new Map(weeks.map((w) => [w, { volume: 0, workouts: 0, sec: 0, sets: 0, prs: 0 }]));
  for (const d of days) {
    const a = acc.get(weekStart(d.day));
    if (!a) continue;
    a.volume += d.volume;
    a.workouts += d.workouts;
    a.sec += d.sec;
    a.sets += d.sets;
    a.prs += d.prs;
  }
  return weeks.map((week) => {
    const a = acc.get(week)!;
    return {
      week,
      volume: a.volume,
      workouts: a.workouts,
      hours: Math.round((a.sec / 3600) * 10) / 10,
      sets: a.sets,
      prs: a.prs,
      density: a.sec > 0 ? Math.round((a.volume / (a.sec / 60)) * 10) / 10 : 0,
    };
  });
}

export type HeatCell = { day: string; volume: number; workouts: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

/**
 * Календарь активности: `weeks` колонок по 7 дней (пн–вс), последняя — текущая неделя.
 * Уровень 1–4 — квартиль объёма среди дней с тренировками (день без веса, но с тренировкой — 1).
 */
export function activityGrid(days: DayRow[], today: string, weeks: number): { columns: HeatCell[][]; thresholds: number[] } {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const volumes = days
    .filter((d) => d.workouts > 0 && d.volume > 0 && d.day >= first && d.day <= today)
    .map((d) => d.volume)
    .sort((a, b) => a - b);
  const q = (p: number) => volumes[Math.min(volumes.length - 1, Math.floor(p * volumes.length))] ?? 0;
  const thresholds = volumes.length ? [q(0.25), q(0.5), q(0.75)] : [];

  const level = (d: DayRow | undefined): HeatCell["level"] => {
    if (!d || d.workouts === 0) return 0;
    if (!thresholds.length || d.volume <= 0) return 1;
    return (1 + thresholds.filter((t) => d.volume > t).length) as HeatCell["level"];
  };

  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const day = addDays(first, w * 7 + i);
      const row = byDay.get(day);
      return { day, volume: row?.volume ?? 0, workouts: row?.workouts ?? 0, level: level(row), future: day > today };
    }),
  );
  return { columns, thresholds };
}

export type StrengthRow = { exerciseId: string; name: string; week: string; oneRm: number };
export type StrengthSeries = { id: string; name: string; key: `s${number}` };

/**
 * Расчётный 1RM по неделям для нескольких упражнений → точки для LineChart.
 * Порядок серий — как пришёл (по частоте), ключи s0, s1… — цвет закреплён за упражнением в этом наборе.
 */
export function strengthSeries(rows: StrengthRow[], weeks: string[]) {
  const series: StrengthSeries[] = [];
  for (const r of rows) {
    if (!series.some((s) => s.id === r.exerciseId)) series.push({ id: r.exerciseId, name: r.name, key: `s${series.length}` });
  }
  const keyOf = new Map(series.map((s) => [s.id, s.key]));
  const points = weeks.map((week) => {
    const point: Record<string, number | string | null> = { week };
    for (const s of series) point[s.key] = null;
    for (const r of rows) if (r.week === week) point[keyOf.get(r.exerciseId)!] = Math.round(r.oneRm * 10) / 10;
    return point;
  });
  return { series, points };
}

/** Распределение по 7 дням недели (1 = пн … 7 = вс) и 24 часам — без пропусков. */
export function rhythm(byWeekday: { dow: number; workouts: number }[], byHour: { hour: number; workouts: number }[]) {
  const LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return {
    weekdays: LABELS.map((label, i) => ({ label, workouts: byWeekday.find((r) => r.dow === i + 1)?.workouts ?? 0 })),
    hours: Array.from({ length: 24 }, (_, hour) => ({
      label: `${hour}:00`,
      workouts: byHour.find((r) => r.hour === hour)?.workouts ?? 0,
    })),
  };
}
