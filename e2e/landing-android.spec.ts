import { expect, test } from "@playwright/test";
import { resetFlag, setFlag } from "./db";

// Флаг native_app для всех — отдельным проектом после остальных (playwright.config.ts, GLOBAL_ANDROID):
// иначе нативные спеки с флагом на пользователя увидели бы его у всех.
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await resetFlag("native_app");
});

test("without native_app for everyone the landing does not mention the Android app", async ({ page }) => {
  await resetFlag("native_app");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Приложение для Android" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Скачать APK" })).toHaveCount(0);
});

test("native_app for everyone: Android section with the APK link, FAQ and the guide mention it", async ({ page }) => {
  await setFlag("native_app", { enabled: true, percent: 100 });
  await page.goto("/");
  const section = page.getByRole("region", { name: "Приложение для Android" });
  await expect(section).toBeVisible();
  await expect(section.getByRole("link", { name: "Скачать APK" })).toHaveAttribute("href", "/download/hero-fit.apk");
  await expect(section.getByRole("link", { name: "Как подключить уведомления" })).toHaveAttribute("href", "/android");
  await expect(page.getByText(/Есть приложение для Android/)).toBeAttached();
  await page.goto("/android");
  await expect(page.getByRole("link", { name: "Скачать APK" })).toHaveAttribute("href", "/download/hero-fit.apk");
});
