import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachAssignOnce, coachTarget, coachTargetCount, coachTemplate, enableCoach, idOf, linkCoach } from "./db";
import { quickWorkout, registerUser } from "./helpers";
import { E2E_TZ_OFFSET } from "./tz";

const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const localDate = (n: number) => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
const SQUAT = "Приседания со штангой";

async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

/** Тренер с шаблоном «Ноги — база» (присед, жим ногами) и клиент со связью. */
async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const templateId = await coachTemplate(coach.login, "Ноги — база");
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  return { coach, templateId, client, clientId: await idOf(client.login) };
}

async function startFromDashboard(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("region", { name: "План на сегодня" }).getByRole("button", { name: "Начать" }).click();
  await expect(page.getByLabel("Название тренировки")).toHaveValue("Ноги — база");
}

test("assigned template starts with the coach's targets; another client gets own history", async ({ page, browser }) => {
  test.slow();
  const { coach, templateId, client } = await setup(page, browser);
  const other = await another(browser, "Второй");
  try {
    await coachTarget(client.login, templateId, SQUAT, { sets: 4, reps: 8, weight: 60 });
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(0), "23:30");
    await startFromDashboard(client.page);
    const squat = client.page.getByRole("region", { name: SQUAT });
    for (let i = 1; i <= 4; i++) {
      await expect(squat.getByLabel(`Вес, подход ${i}`)).toHaveValue("60");
      await expect(squat.getByLabel(`Повторы, подход ${i}`)).toHaveValue("8");
    }
    await expect(squat.getByLabel("Вес, подход 5")).toHaveCount(0);

    await linkCoach(coach.login, other.login);
    await quickWorkout(other.page, SQUAT, [{ weight: "40", reps: "5" }]);
    // Тренировка сегодня закрыла бы сегодняшний план — запускаем из «От тренера»
    await coachAssignOnce(coach.login, other.login, templateId, "Ноги — база", localDate(2));
    await other.page.goto("/training");
    await other.page.getByRole("region", { name: "От тренера" }).getByRole("button", { name: "Начать «Ноги — база»" }).click();
    await expect(other.page.getByRole("region", { name: SQUAT }).getByLabel("Вес, подход 1")).toHaveValue("40");
  } finally {
    await client.context.close();
    await other.context.close();
  }
});

test("«От тренера» start applies targets", async ({ page, browser }) => {
  const { coach, templateId, client } = await setup(page, browser);
  try {
    await coachTarget(client.login, templateId, SQUAT, { weight: 62.5 });
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    await client.page.goto("/training");
    await client.page.getByRole("region", { name: "От тренера" }).getByRole("button", { name: "Начать «Ноги — база»" }).click();
    const squat = client.page.getByRole("region", { name: SQUAT });
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("62.5");
    await expect(squat.getByLabel("Повторы, подход 1")).toHaveValue("10"); // повторы — из шаблона
  } finally {
    await client.context.close();
  }
});

test("disconnecting removes the coach's targets", async ({ page, browser }) => {
  const { templateId, client } = await setup(page, browser);
  try {
    await coachTarget(client.login, templateId, SQUAT, { weight: 60 });
    expect(await coachTargetCount(client.login)).toBe(1);
    await client.page.goto("/settings");
    await client.page.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();
    expect(await coachTargetCount(client.login)).toBe(0);
  } finally {
    await client.context.close();
  }
});

async function openTargets(page: Page, clientId: string) {
  await page.goto(`/coach/clients/${clientId}?tab=plan`);
  const section = page.getByRole("region", { name: "Задания по шаблонам" });
  await section.getByRole("button", { name: "Задания: Ноги — база" }).click();
  return { section, dialog: page.getByRole("dialog", { name: "Задания: Ноги — база" }) };
}

test("coach sets targets in the dialog; client starts with them", async ({ page, browser }) => {
  test.slow();
  const { coach, templateId, client, clientId } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(0), "23:30");
    await page.goto(`/coach/clients/${clientId}?tab=plan`);
    await expect(page.getByRole("region", { name: "Задания по шаблонам" })).toContainText("Ноги — база · заданий нет");
    const { section, dialog } = await openTargets(page, clientId);
    await dialog.getByLabel(`Подходы: ${SQUAT}`).fill("4");
    await dialog.getByLabel(`Повторы: ${SQUAT}`).fill("8");
    await dialog.getByLabel(`Вес, кг: ${SQUAT}`).fill("62,5");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(section).toContainText("задано 1 из 2 упражнений");

    await startFromDashboard(client.page);
    const squat = client.page.getByRole("region", { name: SQUAT });
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("62.5");
    await expect(squat.getByLabel("Повторы, подход 4")).toHaveValue("8");
  } finally {
    await client.context.close();
  }
});

test("clearing all fields removes the target", async ({ page, browser }) => {
  const { coach, templateId, client, clientId } = await setup(page, browser);
  try {
    await coachTarget(client.login, templateId, SQUAT, { sets: 4, weight: 60 });
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    const { section, dialog } = await openTargets(page, clientId);
    await expect(dialog.getByLabel(`Вес, кг: ${SQUAT}`)).toHaveValue("60");
    await dialog.getByLabel(`Подходы: ${SQUAT}`).fill("");
    await dialog.getByLabel(`Вес, кг: ${SQUAT}`).fill("");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(section).toContainText("заданий нет");
    expect(await coachTargetCount(client.login)).toBe(0);
  } finally {
    await client.context.close();
  }
});

test("dialog shows the client's last result", async ({ page, browser }) => {
  const { coach, templateId, client, clientId } = await setup(page, browser);
  try {
    await quickWorkout(client.page, SQUAT, [{ weight: "50", reps: "6" }]);
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    const { dialog } = await openTargets(page, clientId);
    await expect(dialog).toContainText("в прошлый раз: 50 × 6 · 1 подход");
    await expect(dialog).toContainText("ещё не выполнялось");
    await expect(dialog.getByLabel(`Вес, кг: ${SQUAT}`)).toHaveAttribute("placeholder", "50");
  } finally {
    await client.context.close();
  }
});
