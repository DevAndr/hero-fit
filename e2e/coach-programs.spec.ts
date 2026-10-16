import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFlagUser, coachTargetFull, coachTemplate, enableCoach, idOf, linkCoach, removeFlagUser, shiftProgramStart } from "./db";
import { registerUser } from "./helpers";

// Программы тренера (флаг coach_programs — списком на тренера, можно и на mobile); два контекста — --workers=8

const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const SQUAT = "Приседания со штангой";
const TEMPLATE = "Ноги — программа";

async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

async function startFromCoach(page: Page) {
  await page.goto("/training");
  await page.getByRole("region", { name: "От тренера" }).getByRole("button", { name: `Начать «${TEMPLATE}»` }).click();
}

async function cancelWorkout(page: Page) {
  await page.getByRole("button", { name: "Действия с тренировкой" }).click();
  await page.getByRole("menuitem", { name: "Отменить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отменить тренировку" }).click();
  await expect(page.getByLabel("Название тренировки")).toHaveCount(0);
}

test("coach builds a program, assigns it; the client gets week weights, a deload, and the last weight after an early end", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  await addFlagUser("coach_programs", coach.login);
  await coachTemplate(coach.login, TEMPLATE);
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  try {
    // Библиотека: программа на пн, 8 недель, +2,5 %, разгрузка каждая 4-я −10 % (значения по умолчанию)
    await page.goto("/coach");
    await page.getByRole("link", { name: "Программы" }).click();
    await page.getByRole("button", { name: "Новая программа" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill("Сила 8");
    await dialog.getByRole("button", { name: "Пн", exact: true }).click();
    await expect(dialog.getByRole("list", { name: "Предпросмотр по неделям" })).toContainText("4: 95 кг");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("listitem", { name: "Сила 8" })).toContainText(`Пн — ${TEMPLATE}`);

    // Назначение с этой недели, база приседа 100 кг
    await page.goto(`/coach/clients/${await idOf(client.login)}?tab=plan`);
    await page.getByRole("button", { name: "Назначить программу" }).click();
    const assign = page.getByRole("dialog");
    await assign.getByRole("combobox", { name: "Старт" }).click();
    await page.getByRole("option", { name: /с этой недели/ }).click();
    await assign.getByRole("button", { name: "Дальше" }).click();
    await assign.getByLabel(`База, ${SQUAT} (${TEMPLATE})`).fill("100");
    await assign.getByRole("button", { name: "Назначить" }).click();
    await expect(assign).toBeHidden();
    const block = page.getByRole("region", { name: "Программа" });
    await expect(block).toContainText("Неделя 1 из 8");
    await expect(block).toContainText("разгрузка — неделя 4");

    // Клиент: неделя 1 — база
    await startFromCoach(client.page);
    const squat = client.page.getByRole("region", { name: SQUAT });
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("100");
    await expect(squat).toContainText("(неделя 1/8)");
    await cancelWorkout(client.page);

    // Неделя 4 — разгрузка: 95 кг и подходов на 1 меньше
    await shiftProgramStart(client.login, 3);
    await startFromCoach(client.page);
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("95");
    await expect(squat.getByLabel("Вес, подход 3")).toHaveCount(0);
    await expect(squat).toContainText("(разгрузка · неделя 4/8)");
    await cancelWorkout(client.page);

    // Флаг у тренера выключен — веса не по программе, без пометки недели
    await removeFlagUser("coach_programs", coach.login);
    await startFromCoach(client.page);
    await expect(squat.getByLabel("Вес, подход 3")).toBeVisible();
    await expect(squat).not.toContainText("неделя 4/8");
    await cancelWorkout(client.page);
    await addFlagUser("coach_programs", coach.login);

    // Досрочно: вес последней прошедшей обычной недели (3-я — 105 кг) — в задание тренера
    await page.reload();
    await page.getByRole("region", { name: "Программа" }).getByRole("button", { name: "Завершить досрочно" }).click();
    await expect(page.getByText("Программа завершена")).toBeVisible();
    await expect(page.getByRole("region", { name: "Программа" })).toHaveCount(0);
    expect((await coachTargetFull(client.login, SQUAT))?.weight).toBe(105);
  } finally {
    await client.context.close();
  }
});

test("without the flag the coach sees no programs", async ({ page }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  await page.goto("/coach");
  await expect(page.getByRole("link", { name: "Программы" })).toHaveCount(0);
  const res = await page.goto("/coach/programs");
  expect(res?.status()).toBe(404);
});
