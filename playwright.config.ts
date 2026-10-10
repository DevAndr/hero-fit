import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { CERT_PATH, ensureCerts } from "./e2e/certs";
import { TELEGRAM_FAKE_URL } from "./e2e/telegram-server";
import { prepareTestDatabase, testDatabaseUrl } from "./e2e/test-db";
import { E2E_TZ } from "./e2e/tz";

ensureCerts();

// Своя база для e2e: и сервер, и хелперы (e2e/db.ts) работают с ней. Воркеры наследуют env процесса,
// поэтому готовим базу один раз — в главном процессе раннера.
const TEST_DATABASE_URL = testDatabaseUrl();
if (!process.env.TEST_WORKER_INDEX && !process.env.E2E_DB_READY) {
  prepareTestDatabase(process.env.DATABASE_URL!, TEST_DATABASE_URL);
  process.env.E2E_DB_READY = "1";
}
process.env.DATABASE_URL = TEST_DATABASE_URL;

const PORT = 3123;

// Перед запуском нужен продакшен-билд: `npm run build && npm run test:e2e`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Под полной параллельной нагрузкой (и на CI) тяжёлые запросы — завершение тренировки с ачивками,
  // регистрация с argon2 — иногда идут дольше стандартных 5 с; без нагрузки — доли секунды.
  expect: { timeout: 10_000 },
  // CI: одна повторная попытка — случайный сбой под нагрузкой раннера не блокирует деплой, но остаётся в отчёте как flaky
  // (трасса первой попытки сохраняется — trace: retain-on-failure)
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    // Пояс подобран так, чтобы прогон не пересекал полночь (e2e/tz.ts)
    timezoneId: E2E_TZ,
    trace: "retain-on-failure",
    // Без лимита клик ждёт до общего таймаута теста (30 с) и падает безликим «Test timeout» — так он падает с причиной
    actionTimeout: 15_000,
    // Декоративные анимации (Lottie, полоса опыта) выключены — «уменьшить движение»: десятки параллельных
    // браузеров с салютом и SVG-анимациями перегружают машину. Ветка без движения — штатная, её и проверяем.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      // Всегда свой сервер: чужой (без NODE_EXTRA_CA_CERTS) не доставит push в фейковый сервис.
      reuseExistingServer: false,
      // Сервер доверяет сертификату фейкового push-сервиса из e2e/push-server.ts и работает с тестовой базой.
      // E2E_TEST_CLOCK — cron-эндпоинт принимает ?now= (напоминания по дням недели).
      // DAILY_CHEST_AUTOOPEN=off — диалог ежедневного сундука не перекрывает дашборд (сам сундук — e2e/daily-chest.spec.ts);
      // ONBOARDING_TOUR=off — новые пользователи уже прошли экскурсию (сама экскурсия — e2e/onboarding.spec.ts)
      // APP_URL — локальный: иначе из .env подтянется боевой домен (canonical, индексация)
      env: { NODE_EXTRA_CA_CERTS: CERT_PATH, DATABASE_URL: TEST_DATABASE_URL, E2E_TEST_CLOCK: "1", DAILY_CHEST_AUTOOPEN: "off", ONBOARDING_TOUR: "off", APP_URL: `http://localhost:${PORT}`,
        // Telegram-бот ходит в фейковый Bot API (e2e/telegram-server.ts)
        TELEGRAM_BOT_TOKEN: "e2e-token", TELEGRAM_BOT_USERNAME: "hero_fit_e2e_bot", TELEGRAM_WEBHOOK_SECRET: "e2e-telegram-secret-0123456789abcdef", TELEGRAM_API_URL: TELEGRAM_FAKE_URL, TELEGRAM_POLLING: "off" },
      timeout: 60_000,
    },
    { command: "npx tsx e2e/telegram-server.ts", url: `${TELEGRAM_FAKE_URL}/health`, reuseExistingServer: false, timeout: 30_000 },
  ],
});
