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
  await expect(page.getByRole("link", { name: /Приложение для Android/ })).toHaveCount(0);
  // Платформ без Android две (сайт и Telegram) — сетка без пустой ячейки
  await expect(page.getByRole("region", { name: "Где тренироваться с Hero Fit" }).getByRole("listitem")).toHaveCount(2);
});

test("header with Android, clubs and trainers fits 1280px; «Тренеры» in the header, footer and FAQ", async ({ page }) => {
  await setFlag("native_app", { enabled: true, percent: 100 });
  await setFlag("clubs", { enabled: true, percent: 100 });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Разделы сайта" });
    await expect(nav.getByRole("link", { name: "Тренеры" })).toHaveAttribute("href", "/trainers");
    await expect(nav.getByRole("link", { name: "Android" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Клубы" })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Найти тренера" })).toHaveAttribute("href", "/trainers");
    await expect(page.getByRole("heading", { name: "Как найти тренера?" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "Начать бесплатно" })).toBeInViewport();
  } finally {
    await resetFlag("clubs");
  }
});

test("native_app for everyone: Android section with the APK link, FAQ and the guide mention it", async ({ page }) => {
  await setFlag("native_app", { enabled: true, percent: 100 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Где тренироваться с Hero Fit" }).getByRole("listitem")).toHaveCount(3);
  const section = page.getByRole("region", { name: "Приложение для Android" });
  await expect(section).toBeVisible();
  await expect(section.getByRole("link", { name: "Скачать APK" })).toHaveAttribute("href", "/download/hero-fit.apk");
  await expect(section.getByRole("link", { name: "Как подключить уведомления" })).toHaveAttribute("href", "/android");
  await expect(page.getByText(/Есть приложение для Android/)).toBeAttached();
  // Якоря: герой (виден на телефоне), меню шапки (широкий экран) и подвал ведут к секции
  await expect(page.locator("main section").first().getByRole("link", { name: /Приложение для Android/ })).toHaveAttribute("href", "#android");
  await expect(page.getByRole("navigation", { name: "Разделы сайта" }).getByRole("link", { name: "Android" })).toHaveAttribute("href", "/#android");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Приложение для Android" })).toHaveAttribute("href", "/#android");
  await page.locator("main section").first().getByRole("link", { name: /Приложение для Android/ }).click();
  await expect(page).toHaveURL(/#android$/);
  await expect(section).toBeInViewport();
  await page.goto("/android");
  await expect(page.getByRole("link", { name: "Скачать APK" })).toHaveAttribute("href", "/download/hero-fit.apk");
});
