/** Календарные дни «YYYY-MM-DD» без пояса: арифметика от полудня UTC, поэтому переходы на летнее время её не сдвигают. */

const DAY_MS = 24 * 60 * 60 * 1000;
const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);

export function addDays(day: string, n: number): string {
  return new Date(noon(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = понедельник … 6 = воскресенье. */
export function weekdayOf(day: string): number {
  return (new Date(noon(day)).getUTCDay() + 6) % 7;
}

/** Понедельник недели, в которую попадает день. */
export function weekStart(day: string): string {
  return addDays(day, -weekdayOf(day));
}
