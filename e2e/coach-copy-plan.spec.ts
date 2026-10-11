import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachTarget, coachTargetFull, coachTemplate, enableCoach, idOf, linkCoach, setTimeZone, coachAssignOnce } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ_OFFSET } from "./tz";

/** Ник ≤ 20 символов и уникален между прогонами: хвост логина с меткой времени. */
const nickOf = (login: string) => `Coac_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const localNow = () => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000);
const localDate = (n: number) => new Date(localNow().getTime() + n * 86_400_000).toISOString().slice(0, 10);
const SQUAT = "Приседания со штангой";
const PRESS = "Жим ногами";

async function client(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  await setTimeZone(user.login);
  return { context, page, ...user };
}

/** Тренер; у Маши — разовая на через 3 дня и задание по приседу; у Бори — свои задания по тому же шаблону. */
async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login);
  await enableCoach(coach.login, nick);
  await setTimeZone(coach.login);
  const tpl = await coachTemplate(coach.login, "Ноги — база");
  const masha = await client(browser, "Маша");
  const borya = await client(browser, "Боря");
  for (const c of [masha, borya]) await linkCoach(coach.login, c.login);
  await coachAssignOnce(coach.login, masha.login, tpl, "Ноги — база", localDate(3));
  await coachTarget(masha.login, tpl, SQUAT, { sets: 4, reps: 8, weight: 60, step: 2.5, fails: 2 });
  // Только вес: без «С весами» не копируется
  await coachTarget(masha.login, tpl, PRESS, { weight: 100 });
  await coachTarget(borya.login, tpl, SQUAT, { sets: 5, reps: 5 });
  await coachTarget(borya.login, tpl, PRESS, { sets: 3, reps: 12 });
  return { nick, masha, borya };
}

async function copyToBorya(page: Page, mashaLogin: string, withWeights: boolean) {
  await page.goto(`/coach/clients/${await idOf(mashaLogin)}?tab=plan`);
  await page.getByRole("button", { name: "Скопировать план" }).click();
  const dialog = page.getByRole("dialog", { name: "Скопировать план" });
  const picked = dialog.getByRole("group", { name: "Клиенты" });
  // Без весов: задание только с весом не копируется, у перезаписанного вес и шаг сбросятся
  await expect(dialog).toContainText("Будет скопировано: 1 разовая тренировка, 1 задание");
  await expect(picked).toContainText("перезапишется 1 задание · вес и шаг сбросятся");
  await expect(dialog.getByRole("button", { name: "Скопировать", exact: true })).toBeDisabled();
  await picked.getByRole("checkbox", { name: "Боря" }).click();
  if (withWeights) {
    await dialog.getByRole("checkbox", { name: "С весами" }).click();
    await expect(dialog).toContainText("Будет скопировано: 1 разовая тренировка, 2 задания");
    await expect(picked).toContainText("перезапишется 2 задания");
    await expect(picked).not.toContainText("сбросятся");
  }
  await dialog.getByRole("button", { name: "Скопировать", exact: true }).click();
  await expect(page.getByText("План скопирован 1 клиенту")).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

test("copy a plan without weights", async ({ page, browser }) => {
  test.slow();
  const { nick, masha, borya } = await setup(page, browser);
  try {
    await copyToBorya(page, masha.login, false);

    await borya.page.goto(`/calendar?date=${localDate(3)}`);
    await expect(borya.page.getByText(`от тренера · ${nick}`).filter({ visible: true }).first()).toBeVisible();
    await borya.page.goto("/dashboard");
    await borya.page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(borya.page.getByText("Новый план от тренера")).toBeVisible();

    expect(await coachTargetFull(borya.login, SQUAT)).toMatchObject({ sets: 4, reps: 8, weight: null, step: null, fails: 0 });
    expect(await coachTargetFull(borya.login, PRESS)).toMatchObject({ sets: 3, reps: 12 });
    // У источника ничего не изменилось
    expect(await coachTargetFull(masha.login, SQUAT)).toMatchObject({ weight: 60, fails: 2 });
  } finally {
    for (const c of [masha, borya]) await c.context.close();
  }
});

test("copy with weights keeps weight and step", async ({ page, browser }) => {
  test.slow();
  const { masha, borya } = await setup(page, browser);
  try {
    await copyToBorya(page, masha.login, true);
    expect(await coachTargetFull(borya.login, SQUAT)).toMatchObject({ sets: 4, reps: 8, weight: 60, step: 2.5, fails: 0 });
    expect(await coachTargetFull(borya.login, PRESS)).toMatchObject({ sets: null, reps: null, weight: 100 });
  } finally {
    for (const c of [masha, borya]) await c.context.close();
  }
});
