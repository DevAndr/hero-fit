import { defineConfig, devices } from "@playwright/test";
import { CERT_PATH, ensureCerts } from "./e2e/certs";

ensureCerts();

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
    // Другие серверы на той же БД тоже мешают — их фоновый воркер забирает очередь push.
    reuseExistingServer: false,
    // Сервер доверяет сертификату фейкового push-сервиса из e2e/push-server.ts
    env: { NODE_EXTRA_CA_CERTS: CERT_PATH },
    timeout: 60_000,
  },
});
