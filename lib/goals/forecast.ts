/** Прогноз цели по динамике (спека 2026-10-12-strength-analytics): линейный тренд по неделям → дата достижения. */

export type Forecast =
  | { kind: "onTrack" | "eta"; date: string }
  | { kind: "late"; date: string; need: number; pace: number }
  | { kind: "stalled" }
  | { kind: "far" };

const MIN_POINTS = 3;
const MAX_DAYS = 730;
const DAY_MS = 86_400_000;

const toTime = (day: string) => Date.parse(`${day}T12:00:00Z`);
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Наклон МНК: единиц в неделю. */
function slopePerWeek(points: { week: string; value: number }[]) {
  const xs = points.map((p) => (toTime(p.week) - toTime(points[0].week)) / (7 * DAY_MS));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = points.reduce((s, p) => s + p.value, 0) / points.length;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den === 0 ? 0 : xs.reduce((s, x, i) => s + (x - mx) * (points[i].value - my), 0) / den;
}

/** null — меньше 3 точек на 3 разных неделях (показывается paceStatus). */
export function forecastGoal(input: {
  points: { week: string; value: number }[];
  /** Текущее значение цели (рекорд) — для прогноза не используется: темп и старт — из ряда. */
  current: number;
  target: number;
  deadline: string | null;
  today: string;
}): Forecast | null {
  const { target, deadline, today } = input;
  const points = [...input.points].sort((a, b) => a.week.localeCompare(b.week));
  if (points.length < MIN_POINTS || new Set(points.map((p) => p.week)).size < MIN_POINTS) return null;
  const slope = slopePerWeek(points);
  // От последней точки ряда, а не от рекорда за всё время (current): после перерыва рекорд выше текущей формы
  const left = target - points.at(-1)!.value;
  // Нет роста или движение от цели (вес тела — вниз: знак left отрицательный)
  if (slope * Math.sign(left) <= 1e-9) return { kind: "stalled" };
  const days = Math.round((left / slope) * 7);
  if (days > MAX_DAYS) return { kind: "far" };
  const date = toDay(toTime(today) + days * DAY_MS);
  if (!deadline) return { kind: "eta", date };
  if (date <= deadline) return { kind: "onTrack", date };
  // Срок сегодня — не делим на ноль: хотя бы день
  const weeksLeft = Math.max(1, (toTime(deadline) - toTime(today)) / DAY_MS) / 7;
  return { kind: "late", date, need: round1(left / weeksLeft), pace: round1(slope) };
}

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Дата прогноза: в году «сегодня» — «14 ноября», иначе с годом. */
function dateText(date: string, today: string) {
  const d = new Date(toTime(date));
  return date.slice(0, 4) === today.slice(0, 4) ? dayMonth.format(d) : dayMonthYear.format(d).replace(/\s*г\.$/, "");
}

const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}`;

export function forecastText(f: Forecast, opts: { unit: "кг" | "повт."; bodyWeight: boolean; today: string }): string {
  switch (f.kind) {
    case "onTrack":
      return `Успеваешь: ≈ ${dateText(f.date, opts.today)}`;
    case "eta":
      return `≈ ${dateText(f.date, opts.today)}`;
    case "late":
      return `Не успеваешь к сроку: нужно ${signed(f.need)} ${opts.unit} в неделю, сейчас ${signed(f.pace)}`;
    case "stalled":
      return opts.bodyWeight ? "Вес пока не движется к цели" : "Пока без роста — прогноз появится, когда пойдёт прогресс";
    case "far":
      return "Больше 2 лет при текущем темпе";
  }
}

/** Коротко — для дашборда. */
export function forecastShort(f: Forecast, today: string): string {
  switch (f.kind) {
    case "onTrack":
    case "eta":
      return `≈ ${dateText(f.date, today)}`;
    case "late":
      return "не успеваешь к сроку";
    case "stalled":
      return "пока без роста";
    case "far":
      return "больше 2 лет";
  }
}
