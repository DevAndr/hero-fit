/** Ежедневный вход считается по календарным дням в часовом поясе пользователя. */

export function safeTimeZone(tz: string | undefined) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** «YYYY-MM-DD» в заданном поясе. */
export function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Местный день и час 0–23 — для журнала часов захода; key — «YYYY-MM-DDTHH». */
export function localHour(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) % 24;
  return { day, hour, key: `${day}T${String(hour).padStart(2, "0")}` };
}

function previousDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Новое значение серии входов или null, если сегодня вход уже засчитан. */
export function nextLoginStreak(lastDay: string | null, today: string, streak: number): number | null {
  if (lastDay === today) return null;
  return lastDay === previousDay(today) ? streak + 1 : 1;
}
