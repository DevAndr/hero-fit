import { expect, test } from "@playwright/test";
import { E2E_ADMIN, insertErrorGroup, makeAdmin } from "./db";
import { registerUser } from "./helpers";

// makeAdmin переименовывает глобального админа — по очереди и только на desktop
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Админ один на прогон");
});

test("admin sees open groups, resolves and reopens", async ({ page }) => {
  const message = `e2e admin boom ${Date.now()}`;
  const id = await insertErrorGroup({ message, source: "SERVER", count: 3 });
  const me = await registerUser(page);
  await makeAdmin(me.login);
  expect(E2E_ADMIN).toBeTruthy();

  await page.goto("/admin/errors");
  const row = page.getByRole("link", { name: new RegExp(message) });
  await expect(row).toContainText("Сервер");
  await expect(row).toContainText("3");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/admin/errors/${id}$`));
  await expect(page.getByText("at e2e (/app/lib/e2e.ts:1:1)")).toBeVisible();

  await page.getByRole("button", { name: "Решено" }).click();
  await expect(page.getByRole("button", { name: "Открыть снова" })).toBeVisible();
  await page.goto("/admin/errors");
  await expect(page.getByRole("link", { name: new RegExp(message) })).toHaveCount(0);
  await page.goto("/admin/errors?tab=resolved");
  await expect(page.getByRole("link", { name: new RegExp(message) })).toBeVisible();

  await page.goto(`/admin/errors/${id}`);
  await page.getByRole("button", { name: "Открыть снова" }).click();
  await expect(page.getByRole("button", { name: "Решено" })).toBeVisible();
  await page.goto("/admin/errors");
  await expect(page.getByRole("link", { name: new RegExp(message) })).toBeVisible();
});

test("non-admin gets 404 on error pages", async ({ page }) => {
  const id = await insertErrorGroup({ message: "e2e hidden", source: "CLIENT", count: 1 });
  await registerUser(page);
  expect((await page.goto("/admin/errors"))?.status()).toBe(404);
  expect((await page.goto(`/admin/errors/${id}`))?.status()).toBe(404);
});
