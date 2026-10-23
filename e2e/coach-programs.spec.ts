import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachTargetFull, coachTemplate, enableCoach, idOf, linkCoach, programSeriesToday, shiftProgramStart, withDb } from "./db";
import { registerUser } from "./helpers";

// Программы тренера на несколько недель; два контекста — --workers=8

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

/** Отметить первый подход приседа и завершить — сводка. */
async function finishWorkout(page: Page) {
  await page.getByRole("region", { name: SQUAT }).getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\/\w+$/);
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
    await assign.getByRole("button", { name: "Назначить", exact: true }).click();
    await expect(assign).toBeHidden();
    const block = page.getByRole("region", { name: "Программа" });
    await expect(block).toContainText("Неделя 1 из 8");
    await expect(block).toContainText("разгрузка — неделя 4");

    // Клиент: неделя 1 — база
    await startFromCoach(client.page);
    const squat = client.page.getByRole("region", { name: SQUAT });
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("100");
    await expect(squat).toContainText("(неделя 1/8)");
    // Завершили — в сводке неделя программы, автопрогрессии и задания нет
    await finishWorkout(client.page);
    await expect(client.page.getByRole("region", { name: "План тренера" })).toContainText("Программа: неделя 1/8");
    expect(await coachTargetFull(client.login, SQUAT)).toBeUndefined();

    // Неделя 4 — разгрузка: 95 кг и подходов на 1 меньше
    await shiftProgramStart(client.login, 3);
    await startFromCoach(client.page);
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("95");
    await expect(squat.getByLabel("Вес, подход 3")).toHaveCount(0);
    await expect(squat).toContainText("(разгрузка · неделя 4/8)");
    await cancelWorkout(client.page);

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

test("the coach deletes the program's template: the client still trains, the coach ends and reassigns", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const doomed = await coachTemplate(coach.login, TEMPLATE);
  await coachTemplate(coach.login, "Ноги — запас");
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  const url = `/coach/clients/${await idOf(client.login)}?tab=plan`;
  const program = async (name: string, template: string) => {
    await page.goto("/coach/programs");
    await page.getByRole("button", { name: "Новая программа" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill(name);
    await dialog.getByRole("button", { name: "Пн", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Шаблон, Пн" }).click();
    await page.getByRole("option", { name: template }).click();
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
  };
  const assign = async (name: string) => {
    await page.goto(url);
    await page.getByRole("button", { name: "Назначить программу" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Программа" }).click();
    await page.getByRole("option", { name }).click();
    await dialog.getByRole("combobox", { name: "Старт" }).click();
    await page.getByRole("option", { name: /с этой недели/ }).click();
    await dialog.getByRole("button", { name: "Дальше" }).click();
    await dialog.getByLabel(new RegExp(`^База, ${SQUAT}`)).fill("100");
    await dialog.getByRole("button", { name: "Назначить", exact: true }).click();
    await expect(dialog).toBeHidden();
  };
  try {
    await program("Сила 8", TEMPLATE);
    await program("Запас", "Ноги — запас");
    await assign("Сила 8");
    await shiftProgramStart(client.login, 2);
    await withDb((db) => db.query(`delete from "WorkoutTemplate" where id = $1`, [doomed]));

    // Клиент открывает тренировку — ничего не падает
    const res = await client.page.goto("/training");
    expect(res?.status()).toBe(200);

    // Досрочно: шаблона нет — задание не пишется, ошибки нет; переназначить можно
    await page.goto(url);
    await page.getByRole("region", { name: "Программа" }).getByRole("button", { name: "Завершить досрочно" }).click();
    await expect(page.getByText("Программа завершена")).toBeVisible();
    expect(await coachTargetFull(client.login, SQUAT)).toBeUndefined();
    await assign("Запас");
    await expect(page.getByRole("region", { name: "Программа" })).toContainText("Неделя 1 из 8");
  } finally {
    await client.context.close();
  }
});

test("early end keeps today's workout; a new program the same day takes the day without a duplicate", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  await coachTemplate(coach.login, TEMPLATE);
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  const url = `/coach/clients/${await idOf(client.login)}?tab=plan`;
  const assign = async () => {
    await page.goto(url);
    await page.getByRole("button", { name: "Назначить программу" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Старт" }).click();
    await page.getByRole("option", { name: /с этой недели/ }).click();
    await dialog.getByRole("button", { name: "Дальше" }).click();
    await dialog.getByLabel(`База, ${SQUAT} (${TEMPLATE})`).fill("100");
    await dialog.getByRole("button", { name: "Назначить", exact: true }).click();
    await expect(dialog).toBeHidden();
  };
  try {
    // Каждый день недели — сегодня в программе точно есть тренировка
    await page.goto("/coach/programs");
    await page.getByRole("button", { name: "Новая программа" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill("Каждый день");
    for (const day of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) await dialog.getByRole("button", { name: day, exact: true }).click();
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();

    await assign();
    expect(await programSeriesToday(client.login)).toBe(1);

    await page.getByRole("region", { name: "Программа" }).getByRole("button", { name: "Завершить досрочно" }).click();
    await expect(page.getByText("Программа завершена")).toBeVisible();
    expect(await programSeriesToday(client.login)).toBe(1);

    await assign();
    expect(await programSeriesToday(client.login)).toBe(1);
  } finally {
    await client.context.close();
  }
});

test("a new template can be made right from the program dialog and is picked for that day", async ({ page }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  await page.goto("/coach/programs");
  await page.getByRole("button", { name: "Новая программа" }).click();
  const program = page.getByRole("dialog", { name: "Новая программа" });
  await program.getByLabel("Название").fill("Сила с нуля");
  await program.getByRole("button", { name: "Пн", exact: true }).click();

  // Шаблонов ещё нет — создаём из выпадающего списка дня
  await program.getByRole("combobox", { name: "Шаблон, Пн" }).click();
  await page.getByRole("option", { name: "+ Новый шаблон…" }).click();
  const editor = page.getByRole("dialog", { name: "Новый шаблон" });
  await editor.getByLabel("Название").fill("Ноги — понедельник");
  await editor.getByRole("button", { name: "Добавить упражнение" }).click();
  const picker = page.getByRole("dialog").last();
  await picker.getByLabel("Поиск упражнения").fill(SQUAT);
  await picker.getByRole("button", { name: new RegExp(`^${SQUAT}`) }).click();
  await picker.getByRole("button", { name: /^Добавить \(/ }).click();
  await editor.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(editor).toBeHidden();

  // Шаблон выбран для понедельника, введённое в программе на месте
  await expect(program.getByRole("combobox", { name: "Шаблон, Пн" })).toContainText("Ноги — понедельник");
  await expect(program.getByLabel("Название")).toHaveValue("Сила с нуля");
  await program.getByRole("button", { name: "Сохранить" }).click();
  await expect(program).toBeHidden();
  await expect(page.getByRole("listitem", { name: "Сила с нуля" })).toContainText("Пн — Ноги — понедельник");

  // Шаблон — обычный, виден в «Шаблонах»
  await page.goto("/templates");
  await expect(page.getByRole("article", { name: "Ноги — понедельник" })).toContainText(SQUAT);
});
