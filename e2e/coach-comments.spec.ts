import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { enableCoach, idOf, linkCoach } from "./db";
import { quickWorkout, registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами на одной тестовой базе: хвост логина с меткой времени. */
const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

/** Сохранено, когда поле ввода закрылось: до ответа сервера текст ещё в поле и виден проверкам. */
async function saved(field: Locator) {
  await expect(field).toHaveCount(0);
}

async function bell(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
}

/** Тренер и клиент со связью; у клиента одна завершённая тренировка «Жим штанги лёжа». */
async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  const coachNick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, coachNick);
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  await quickWorkout(client.page, "Жим штанги лёжа", [{ weight: "60", reps: "8" }]);
  const workoutId = client.page.url().split("/").at(-1)!;
  const clientId = await idOf(client.login);
  return { coach, coachNick, client, clientId, workoutId, coachUrl: `/coach/clients/${clientId}/workouts/${workoutId}` };
}

test("coach leaves a general comment and an exercise note; client sees both and gets one notification", async ({ page, browser }) => {
  test.slow();
  const { coachNick, client, workoutId, coachUrl } = await setup(page, browser);
  try {
    await page.goto(coachUrl);
    const general = page.getByRole("region", { name: "Комментарий тренера" });
    await general.getByLabel("Комментарий тренера").fill("Отличная тренировка, держи темп");
    await general.getByRole("button", { name: "Сохранить" }).click();
    await saved(general.getByLabel("Комментарий тренера"));
    await expect(general.getByText("Отличная тренировка, держи темп")).toBeVisible();

    await page.getByRole("button", { name: "Заметка к «Жим штанги лёжа»" }).click();
    await page.getByLabel("Заметка к «Жим штанги лёжа»").fill("Лопатки сведены — молодец");
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await saved(page.getByLabel("Заметка к «Жим штанги лёжа»"));
    await expect(page.getByText("Лопатки сведены — молодец")).toBeVisible();

    await bell(client.page);
    await expect(client.page.getByText("Комментарий тренера к «Тренировка»")).toHaveCount(1);
    await client.page.goto(`/workouts/${workoutId}`);
    await expect(client.page.getByText("Тренер: Лопатки сведены — молодец")).toBeVisible();
    const clientGeneral = client.page.getByRole("region", { name: "Комментарий тренера" });
    await expect(clientGeneral).toContainText("Отличная тренировка, держи темп");
    await expect(clientGeneral).toContainText(`Комментарий тренера · ${coachNick}`);
  } finally {
    await client.context.close();
  }
});

test("coach edits and deletes a note; workouts tab marks commented workouts", async ({ page, browser }) => {
  test.slow();
  const { client, clientId, workoutId, coachUrl } = await setup(page, browser);
  try {
    await page.goto(coachUrl);
    await page.getByRole("button", { name: "Заметка к «Жим штанги лёжа»" }).click();
    await page.getByLabel("Заметка к «Жим штанги лёжа»").fill("Первый вариант");
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await saved(page.getByLabel("Заметка к «Жим штанги лёжа»"));
    await expect(page.getByText("Первый вариант")).toBeVisible();

    await page.goto(`/coach/clients/${clientId}?tab=workouts`);
    await expect(page.getByRole("list", { name: "Тренировки клиента" }).getByText("есть комментарий")).toHaveCount(1);

    await page.goto(coachUrl);
    await page.getByRole("button", { name: "Изменить заметку" }).click();
    await page.getByLabel("Заметка к «Жим штанги лёжа»").fill("Второй вариант");
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await saved(page.getByLabel("Заметка к «Жим штанги лёжа»"));
    await expect(page.getByText("Второй вариант")).toBeVisible();
    await client.page.goto(`/workouts/${workoutId}`);
    await expect(client.page.getByText("Тренер: Второй вариант")).toBeVisible();

    await page.getByRole("button", { name: "Удалить заметку" }).click();
    await expect(page.getByText("Второй вариант")).toHaveCount(0);
    await client.page.reload();
    await expect(client.page.getByText(/Тренер: /)).toHaveCount(0);
  } finally {
    await client.context.close();
  }
});

test("a coach without the link gets 404; comments stay with the client after disconnecting", async ({ page, browser }) => {
  test.slow();
  const { client, workoutId, coachUrl } = await setup(page, browser);
  const stranger = await another(browser, "Чужой");
  try {
    await page.goto(coachUrl);
    const general = page.getByRole("region", { name: "Комментарий тренера" });
    await general.getByLabel("Комментарий тренера").fill("Хорошо");
    await general.getByRole("button", { name: "Сохранить" }).click();
    await saved(general.getByLabel("Комментарий тренера"));
    await expect(general.getByText("Хорошо", { exact: true })).toBeVisible();

    await enableCoach(stranger.login, nickOf(stranger.login, "Strn"));
    expect((await stranger.page.goto(coachUrl))?.status()).toBe(404);

    await client.page.goto("/settings");
    await client.page.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();
    await client.page.goto(`/workouts/${workoutId}`);
    await expect(client.page.getByRole("region", { name: "Комментарий тренера" })).toContainText("Хорошо");
  } finally {
    await client.context.close();
    await stranger.context.close();
  }
});

test("after the client reads the summary, the next comment is a new notification", async ({ page, browser }) => {
  test.slow();
  const { client, workoutId, coachUrl } = await setup(page, browser);
  try {
    await page.goto(coachUrl);
    const general = page.getByRole("region", { name: "Комментарий тренера" });
    await general.getByLabel("Комментарий тренера").fill("Первый отзыв");
    await general.getByRole("button", { name: "Сохранить" }).click();
    await saved(general.getByLabel("Комментарий тренера"));

    // Клиент открыл сводку (например, по push), колокольчик не трогал
    await client.page.goto(`/workouts/${workoutId}`);
    await expect(client.page.getByRole("region", { name: "Комментарий тренера" })).toContainText("Первый отзыв");

    await page.getByRole("button", { name: "Заметка к «Жим штанги лёжа»" }).click();
    await page.getByLabel("Заметка к «Жим штанги лёжа»").fill("Второй отзыв");
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await saved(page.getByLabel("Заметка к «Жим штанги лёжа»"));

    await bell(client.page);
    await expect(client.page.getByText("Комментарий тренера к «Тренировка»")).toHaveCount(2);
  } finally {
    await client.context.close();
  }
});
