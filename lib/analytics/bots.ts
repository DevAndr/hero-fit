/** Краулеры, скрипты и безголовые браузеры не считаются заходами на лендинг. Чистая функция, без server-only (её импортирует proxy). */
const BOT_UA = /bot|crawl|spider|slurp|curl|wget|python|httpclient|headless|lighthouse|preview|monitor/i;

export function isBot(ua: string | null): boolean {
  return !ua || BOT_UA.test(ua);
}
