import { expect, test, type Page } from "@playwright/test";
import { registerUser } from "./helpers";
import { mockTelegram, tgBack, tgCalls, tgEmit } from "./telegram-webapp";

/** Уникальный Telegram id на тест (база общая для воркеров). */
const newTelegramId = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

type Opts = { colorScheme?: "light" | "dark"; version?: string };

/** Новый человек из Mini App → дашборд; заглушка SDK остаётся на всех следующих страницах. */
async function openMiniApp(page: Page, opts: Opts = {}) {
  await mockTelegram(page, { id: newTelegramId(), firstName: "Маша", ...opts });
  await page.goto("/tg");
  await page.getByRole("checkbox", { name: /Согласен с политикой обработки персональных данных/ }).check();
  await page.getByRole("button", { name: "Начать" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const names = async (page: Page) => (await tgCalls(page)).map((c) => c[0] as string);
const last = async (page: Page, ...methods: string[]) => (await names(page)).filter((n) => methods.includes(n)).at(-1);

test("startup: ready, expand, vertical swipes off", async ({ page }) => {
  await openMiniApp(page);
  await expect.poll(() => names(page)).toEqual(expect.arrayContaining(["ready", "expand", "disableVerticalSwipes"]));
});

test("old Telegram: no vertical-swipe call, app still works", async ({ page }) => {
  await openMiniApp(page, { version: "7.0" });
  await expect.poll(() => names(page)).toContain("ready");
  expect(await names(page)).not.toContain("disableVerticalSwipes");
  expect(await names(page)).not.toContain("setBottomBarColor");
});

test("back button: hidden on root pages, goes back inside, to parent on a first page", async ({ page }) => {
  await openMiniApp(page);
  await expect.poll(() => last(page, "BackButton.show", "BackButton.hide")).toBe("BackButton.hide");

  await page.getByRole("button", { name: "Меню профиля" }).click();
  await page.getByRole("menuitem", { name: "Настройки" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect.poll(() => last(page, "BackButton.show", "BackButton.hide")).toBe("BackButton.show");
  await tgBack(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => last(page, "BackButton.show", "BackButton.hide")).toBe("BackButton.hide");

  // Полная загрузка — истории в приложении нет: «Назад» ведёт в раздел, а не из приложения
  await page.goto("/stats/exercises/unknown");
  await expect.poll(() => last(page, "BackButton.show", "BackButton.hide")).toBe("BackButton.show");
  await tgBack(page);
  await expect(page).toHaveURL(/\/stats$/);
});

test("Telegram colour scheme sets the theme and the header colour", async ({ page }) => {
  await openMiniApp(page, { colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  const headers = async () => (await tgCalls(page)).filter((c) => c[0] === "setHeaderColor").map((c) => c[1] as string);
  await expect.poll(headers).not.toHaveLength(0);
  const light = (await headers()).at(-1)!;
  expect(light).toMatch(/^#[0-9a-f]{6}$/);
  expect(await names(page)).toEqual(expect.arrayContaining(["setBackgroundColor", "setBottomBarColor"]));

  await tgEmit(page, "themeChanged", { colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect.poll(async () => (await headers()).at(-1)).not.toBe(light);
});

test("plain sign-in does not load the Telegram SDK", async ({ page }) => {
  const sdk: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("telegram.org")) sdk.push(r.url());
  });
  await registerUser(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  expect(sdk).toEqual([]);
});
