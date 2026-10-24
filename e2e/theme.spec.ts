import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

const html = (page: import("@playwright/test").Page) => page.locator("html");

test("theme: follows the OS by default, switch in settings persists, system follows OS", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await registerUser(page);
  // По умолчанию — как в системе
  await expect(html(page)).toHaveClass(/\blight\b/);

  await page.goto("/settings");
  const theme = page.getByRole("radiogroup", { name: "Тема" });
  await expect(theme.getByRole("radio", { name: "Системная" })).toBeChecked();

  await theme.getByRole("radio", { name: "Светлая" }).click();
  await expect(html(page)).toHaveClass(/\blight\b/);
  await page.reload();
  await expect(html(page)).toHaveClass(/\blight\b/);
  await expect(page.getByRole("radiogroup", { name: "Тема" }).getByRole("radio", { name: "Светлая" })).toBeChecked();

  // Выбор действует на всём приложении
  await page.goto("/dashboard");
  await expect(html(page)).toHaveClass(/\blight\b/);

  // «Системная» — следует prefers-color-scheme
  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Тема" }).getByRole("radio", { name: "Системная" }).click();
  await expect(html(page)).toHaveClass(/\blight\b/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveClass(/\bdark\b/);
});
