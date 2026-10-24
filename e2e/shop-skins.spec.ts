import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, equipItem, withDb } from "./db";
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
