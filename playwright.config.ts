import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { CERT_PATH, ensureCerts } from "./e2e/certs";
import { prepareTestDatabase, testDatabaseUrl } from "./e2e/test-db";

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
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Всегда свой сервер: чужой (без NODE_EXTRA_CA_CERTS) не доставит push в фейковый сервис.
    reuseExistingServer: false,
    // Сервер доверяет сертификату фейкового push-сервиса из e2e/push-server.ts и работает с тестовой базой.
    env: { NODE_EXTRA_CA_CERTS: CERT_PATH, DATABASE_URL: TEST_DATABASE_URL },
    timeout: 60_000,
  },
});
