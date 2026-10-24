import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, coinBalance, equipItem, setCoins, withDb } from "./db";
import { registerUser } from "./helpers";
import { openMiniApp, tgEmit } from "./telegram-webapp";

// Скины — темы магазина со своим фоном и режимом (флаг shop списком на пользователя)

const html = (page: Page) => page.locator("html");
const cssVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const colorScheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

async function skinned(page: Page, code: string) {
  const me = await registerUser(page);
  await addFlagUser("shop", me.login);
  await equipItem(me.login, "theme", code);
  return me;
}

test("dark skin locks the cabinet dark even on a light system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await skinned(page, "theme:cyberpunk");
  await page.goto("/dashboard");
  await expect(html(page)).toHaveClass(/\bdark\b/);
  expect(await cssVar(page, "--background")).toBe("#0d0221");
  expect(await colorScheme(page)).toBe("dark");

  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  expect(await cssVar(page, "--background")).toBe("#0d0221");

  // Системная тема меняется на лету — режим скина держится
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(html(page)).not.toHaveClass(/\blight\b/);
  }
});

test("light skin locks the cabinet light on a dark system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await skinned(page, "theme:sepia");
  await page.goto("/dashboard");
  await expect(html(page)).toHaveClass(/\blight\b/);
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  expect(await cssVar(page, "--background")).toBe("#f4ecd8");
  expect(await colorScheme(page)).toBe("light");
});

test("taking the skin off returns the user's own mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await skinned(page, "theme:cyberpunk");
  await page.goto("/shop?tab=theme");
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await page.getByTestId("shop-item-theme:default").click();
  await page.getByRole("dialog").getByRole("button", { name: "Надеть" }).click();
  await expect(html(page)).toHaveClass(/\blight\b/);
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  expect(await cssVar(page, "--background")).not.toBe("#0d0221");
});

test("Telegram theme change does not beat the skin", async ({ page }) => {
  const telegramId = await openMiniApp(page, { colorScheme: "light" });
  const login = await withDb(async (db) => {
    const { rows } = await db.query<{ login: string }>(`select login from "User" where "telegramId" = $1`, [telegramId]);
    return rows[0].login;
  });
  await addFlagUser("shop", login);
  await equipItem(login, "theme", "theme:cyberpunk");
  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await tgEmit(page, "themeChanged", { colorScheme: "light" });
  await page.waitForTimeout(300);
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await expect(html(page)).not.toHaveClass(/\blight\b/);
});

test("the landing keeps the user's own look", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await skinned(page, "theme:cyberpunk");
  await page.goto("/");
  await expect(html(page)).toHaveClass(/\blight\b/);
  expect(await cssVar(page, "--background")).not.toBe("#0d0221");
});

test("settings explain the worn skin", async ({ page }) => {
  const me = await skinned(page, "theme:cyberpunk");
  await page.goto("/settings");
  const look = page.getByRole("region", { name: "Оформление" });
  await expect(look).toContainText("Сейчас надета тема «Киберпанк» — она всегда тёмная. Снять — в магазине");
  await expect(look.getByRole("link", { name: "в магазине" })).toHaveAttribute("href", "/shop?tab=theme");
  // Выбор режима работает и при скине — он сохранится и включится после снятия
  await look.getByRole("radio", { name: "Светлая" }).click();
  await expect(look.getByRole("radio", { name: "Светлая" })).toBeChecked();
  await expect(html(page)).toHaveClass(/\bdark\b/);

  await equipItem(me.login, "theme", "theme:ocean");
  await page.reload();
  await expect(page.getByRole("region", { name: "Оформление" })).not.toContainText("Сейчас надета тема");
});

test("buying a skin: preview, price and the balance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const me = await registerUser(page);
  await addFlagUser("shop", me.login);
  await setCoins(me.login, 2000);
  await page.goto("/shop?tab=theme");
  await page.getByTestId("shop-item-theme:cyberpunk").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("skin-preview")).toBeVisible();
  await expect(dialog.getByTestId("skin-preview")).toContainText("Тёмная тема");
  await dialog.getByRole("button", { name: "Купить за 2000" }).click();
  await dialog.getByRole("button", { name: "Надеть" }).click();
  await expect(dialog.getByRole("button", { name: "Снять" })).toBeVisible();
  expect(await coinBalance(me.login)).toBe(0);
  await page.goto("/dashboard");
  await expect(html(page)).toHaveClass(/\bdark\b/);
});
