/**
 * Пояс браузера и пользователей в e2e — фиксированное смещение, при котором на старте прогона местное время 12:xx.
 * Тесты опираются на «сегодня» (планы на 23:30, сундук раз в день, тренировки этого дня), и с постоянным поясом
 * прогон, начатый незадолго до полуночи, ломался на смене суток. До границы суток — 11+ часов в обе стороны.
 * Выбирается один раз в главном процессе раннера; воркеры наследуют env и берут то же значение.
 */
function pickOffset() {
  let offset = 12 - new Date().getUTCHours();
  if (offset > 14) offset -= 24;
  return offset;
}

process.env.E2E_TZ_OFFSET ??= String(pickOffset());

/** Смещение от UTC в часах (−11…+12). */
export const E2E_TZ_OFFSET = Number(process.env.E2E_TZ_OFFSET);

/** IANA-имя пояса: у Etc/GMT знак обратный (UTC+3 — Etc/GMT-3). */
export const E2E_TZ = E2E_TZ_OFFSET === 0 ? "UTC" : `Etc/GMT${E2E_TZ_OFFSET > 0 ? "-" : "+"}${Math.abs(E2E_TZ_OFFSET)}`;

/** Суффикс для ISO-строк: «+03:00». */
export const E2E_TZ_ISO = `${E2E_TZ_OFFSET < 0 ? "-" : "+"}${String(Math.abs(E2E_TZ_OFFSET)).padStart(2, "0")}:00`;

/** Момент «day time» в поясе e2e (+ plusDays суток). */
export const localAt = (day: string, time: string, plusDays = 0) =>
  new Date(Date.parse(`${day}T${time}:00${E2E_TZ_ISO}`) + plusDays * 86_400_000);
