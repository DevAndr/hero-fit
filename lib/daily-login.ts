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
