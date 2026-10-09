import { expect, test, type Page } from "@playwright/test";
import { resetOnboarding } from "./db";
import { registerUser } from "./helpers";

const tour = (page: Page, title: string) => page.getByRole("dialog", { name: title });

/** Новый пользователь с непройденной экскурсией на дашборде. */
async function freshUser(page: Page) {
  const user = await registerUser(page);
  await resetOnboarding(user.login);
  await page.reload();
  await expect(tour(page, "Добро пожаловать в Hero Fit")).toBeVisible();
  return user;
}

async function toFinal(page: Page) {
  await page.getByRole("button", { name: "Поехали" }).click();
  for (const title of ["Уровень и опыт", "Недельный streak", "Босс недели", "Карта мышц", "Разделы"]) {
    await expect(tour(page, title)).toBeVisible();
    await page.getByRole("button", { name: "Далее" }).click();
  }
  await expect(tour(page, "Первая тренировка")).toBeVisible();
}

test("full tour → Full Body opens the workout editor", async ({ page }) => {
  await freshUser(page);
  await expect(page.getByText("1 / 7")).toBeVisible();
  await toFinal(page);
  await tour(page, "Первая тренировка").getByRole("button", { name: /Full Body/ }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByRole("region", { name: "Приседания со штангой" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("back returns to the previous step, Esc skips", async ({ page }) => {
  await freshUser(page);
  await page.getByRole("button", { name: "Поехали" }).click();
  await expect(tour(page, "Уровень и опыт")).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(tour(page, "Добро пожаловать в Hero Fit")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("skip on the second step is remembered", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await freshUser(page);
  await page.getByRole("button", { name: "Поехали" }).click();
  await page.getByRole("button", { name: "Пропустить" }).dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("final Esc means «not now» and stays on the dashboard", async ({ page }) => {
  await freshUser(page);
  await toFinal(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("program with an active workout still completes the tour", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/training");
  const empty = page.getByRole("button", { name: /Пустая тренировка/ });
  await empty.click();
  await expect(empty).toHaveCount(0);
  await resetOnboarding(login);
  await page.goto("/dashboard");
  await toFinal(page);
  await tour(page, "Первая тренировка").getByRole("button", { name: /Full Body/ }).click();
  await expect(page).toHaveURL(/\/training$/);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("restart from settings shows the tour again", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Показать экскурсию ещё раз" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tour(page, "Добро пожаловать в Hero Fit")).toBeVisible();
});

test("element hidden mid-step (resize across lg) — no zero-size highlight in the corner", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "нужна смена с ПК на телефон");
  await freshUser(page);
  await page.getByRole("button", { name: "Поехали" }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour(page, "Разделы")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await page.getByTestId("tour-highlight").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.y ?? 0).toBeGreaterThan(400);
});

test("offline skip does not crash the page", async ({ page, context }) => {
  await freshUser(page);
  await page.getByRole("button", { name: "Поехали" }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Пропустить" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Application error/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Привет, Герой!" })).toBeVisible();
  await page.screenshot({ path: "test-results/offline-skip.png" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await context.setOffline(false);
});
