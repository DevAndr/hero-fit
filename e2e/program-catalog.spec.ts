import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  activeAssignments,
  coachNotifications,
  coachProfile,
  coachRecapRows,
  coachTemplate,
  enableCoach,
  linkCoach,
  notificationTitles,
  programSeriesAfterToday,
  programSeriesToday,
  resetFlag,
  seedCoachAssignment,
  seedCoachProgram,
  setFlag,
  setProgramPublished,
  shiftProgramStart,
  templateExerciseLines,
  templatesOf,
  withDb,
} from "./db";
import { registerUser, runTick } from "./helpers";

// Каталог программ тренеров — под глобальным флагом program_catalog: сценарии по очереди, только desktop
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "глобальный флаг — один проект");
  await setFlag("program_catalog", { enabled: true, percent: 100 });
});
test.afterEach(async ({}, info) => {
  if (info.project.name === "desktop") await resetFlag("program_catalog");
});

const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const SQUAT = "Приседания со штангой";

/** Тренер с опубликованной программой на шаблоне «Ноги …» (присед + жим ногами 3 × 10). */
async function publishedProgram(page: Page, o: { weekdays?: number[]; prefix?: string } = {}) {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  const name = `${o.prefix ?? "Сила"} ${nick}`;
  const template = `Ноги ${nick}`;
  const templateId = await coachTemplate(coach.login, template);
  const id = await seedCoachProgram(coach.login, templateId, { name, weekdays: o.weekdays ?? [0, 2, 4], publish: true, description: "Описание" });
  return { coach, nick, name, template, templateId, id };
}

async function athlete(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, "Атлет");
  return { context, page, ...user };
}

/** Диалог запуска до шага баз: «Начать программу» → старт → «Дальше». */
async function openStart(page: Page, programId: string, start: "this" | "next" = "next") {
  await page.goto(`/programs/${programId}`);
  await page.getByRole("button", { name: "Начать программу" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Старт" }).click();
  await page.getByRole("option", { name: start === "this" ? /с этой недели/ : /со следующей/ }).click();
  await dialog.getByRole("button", { name: "Дальше" }).click();
  await expect(dialog.getByRole("button", { name: "Начать", exact: true })).toBeVisible();
  return dialog;
}

async function startProgram(page: Page, programId: string, start: "this" | "next" = "next") {
  const dialog = await openStart(page, programId, start);
  await dialog.getByRole("button", { name: "Начать", exact: true }).click();
  await expect(page.getByText("Программа начата")).toBeVisible();
  await expect(page).toHaveURL(/\/calendar\?date=/);
}

test("a coach publishes a program and a user sees it in the catalog", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  await coachProfile(coach.login, { about: "Тренер", publish: true });
  const name = `Сила ${nick}`;
  const templateId = await coachTemplate(coach.login, `Ноги ${nick}`);
  await seedCoachProgram(coach.login, templateId, { name, weekdays: [0, 2, 4] });

  await page.goto("/coach/programs");
  const item = page.getByRole("listitem", { name });
  await expect(item).not.toContainText("В каталоге");
  await item.getByRole("button", { name: `Изменить «${name}»` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("switch", { name: "Опубликовать в каталоге" }).click();
  // Без описания публикация не проходит
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Добавьте описание для каталога")).toBeVisible();
  await dialog.getByLabel("Описание для каталога").fill("Для новичков: сила в трёх днях, нужна штанга");
  await expect(dialog).toContainText("Для кого, цель, инвентарь");
  await expect(dialog).toContainText("44 / 300");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(item).toContainText("В каталоге · занимаются 0");

  const user = await browser.newContext();
  try {
    const userPage = await user.newPage();
    await registerUser(userPage, "Атлет");
    await userPage.goto("/dashboard");
    await userPage.getByRole("link", { name: "Программы" }).first().click();
    await expect(userPage).toHaveURL(/\/programs$/);
    const card = userPage.getByRole("listitem", { name });
    await expect(card).toContainText("+2,5 % в неделю · разгрузка каждую 4-ю неделю");
    await expect(card).toContainText("8 нед.");
    await expect(card).toContainText("3 дня в неделю");
    await expect(card).toContainText("занимаются 0");
    await expect(card.getByRole("link", { name: nick, exact: true })).toHaveAttribute("href", `/trainer/${nick}`);

    await card.getByRole("link", { name, exact: true }).click();
    await expect(userPage.getByRole("heading", { name })).toBeVisible();
    await expect(userPage.getByText("Для новичков: сила в трёх днях, нужна штанга")).toBeVisible();
    const days = userPage.getByRole("list", { name: "Дни недели" });
    await expect(days).toContainText("Пн");
    await expect(days).toContainText("Ср");
    await expect(days).toContainText("Пт");
    await expect(days).toContainText(`Ноги ${nick}`);
    await expect(days).toContainText("Приседания со штангой");
    await expect(userPage.getByRole("list", { name: "Предпросмотр по неделям" })).toContainText("4: 95 кг");

    // Снять с публикации — из каталога пропадает
    await item.getByRole("button", { name: `Изменить «${name}»` }).click();
    await dialog.getByRole("switch", { name: "Опубликовать в каталоге" }).click();
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await userPage.goto("/programs");
    await expect(userPage.getByRole("listitem", { name })).toHaveCount(0);
  } finally {
    await user.close();
  }
});

test("without the flag the catalog is hidden", async ({ page }) => {
  await setFlag("program_catalog", { enabled: false });
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  const name = `Сила ${nick}`;
  const programId = await seedCoachProgram(coach.login, await coachTemplate(coach.login, `Ноги ${nick}`), { name, publish: true, description: "Описание" });

  expect((await page.goto("/programs"))?.status()).toBe(404);
  expect((await page.goto(`/programs/${programId}`))?.status()).toBe(404);
  expect((await page.goto("/admin/programs"))?.status()).toBe(404);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Программы" })).toHaveCount(0);

  await page.goto("/coach/programs");
  await expect(page.getByRole("listitem", { name })).not.toContainText("В каталоге");
  await page.getByRole("button", { name: `Изменить «${name}»` }).click();
  await expect(page.getByRole("switch", { name: "Опубликовать в каталоге" })).toHaveCount(0);
});

test("a user starts a program next week with bases", async ({ page, browser, request }) => {
  test.slow();
  const p = await publishedProgram(page);
  const user = await athlete(browser);
  try {
    const dialog = await openStart(user.page, p.id, "next");
    await dialog.getByLabel(`База, ${SQUAT} (${p.template})`).fill("100");
    await dialog.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(user.page.getByText("Программа начата")).toBeVisible();
    await expect(user.page).toHaveURL(/\/calendar\?date=\d{4}-\d{2}-\d{2}$/);

    // У пользователя — копия шаблона автора, сгруппированная названием программы
    const copies = await templatesOf(user.login);
    expect(copies.map((t) => [t.name, t.program])).toEqual([[p.template, p.name]]);
    expect(copies[0].id).not.toBe(p.templateId);
    expect(await templateExerciseLines(copies[0].id)).toEqual(await templateExerciseLines(p.templateId));
    expect(await activeAssignments(user.login)).toEqual([{ name: p.name, coachId: null, catalogProgramId: p.id }]);

    // Календарь: серии программы с неделей; первая тренировка — вес по базе
    const monday = user.page.getByRole("button", { name: new RegExp(`^${p.template}, понедельник, .*, программа «${p.name}» \\(неделя 1/8\\)$`) });
    await monday.click();
    await user.page.getByRole("dialog").getByRole("button", { name: "Начать" }).click();
    const squat = user.page.getByRole("region", { name: SQUAT });
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("100");
    await expect(squat).toContainText(`программа «${p.name}»: 3 подхода · 100 кг (неделя 1/8)`);

    await user.page.goto(`/programs/${p.id}`);
    await expect(user.page.getByText("занимаются 1")).toBeVisible();

    // Автор не видит занимающегося среди клиентов и в итогах недели
    await page.goto("/coach");
    await expect(page.getByRole("main")).not.toContainText("Атлет");
    await runTick(request);
    expect(await coachRecapRows(p.coach.login)).toEqual([]);

    // За неделю до конца — напоминание самому пользователю, не автору
    await shiftProgramStart(user.login, 8);
    await runTick(request);
    expect(await notificationTitles(user.login)).toContain(`Программа «${p.name}» заканчивается через неделю`);
    expect((await coachNotifications(p.coach.login)).map((n) => n.title).join("\n")).not.toContain("заканчивается");
  } finally {
    await user.context.close();
  }
});

test("author edits and unpublishes — the running program is untouched", async ({ page, browser }) => {
  test.slow();
  const p = await publishedProgram(page);
  const user = await athlete(browser);
  try {
    await startProgram(user.page, p.id, "this");
    const [copy] = await templatesOf(user.login);
    const before = await templateExerciseLines(copy.id);

    // Автор правит шаблон дня: подходы и состав
    await withDb(async (db) => {
      await db.query(`update "TemplateExercise" set "targetSets" = 6, "targetReps" = 2 where "templateId" = $1`, [p.templateId]);
      await db.query(
        `delete from "TemplateExercise" where "templateId" = $1 and "exerciseId" = (select id from "Exercise" where name = 'Жим ногами' and "userId" is null)`,
        [p.templateId],
      );
    });
    expect(await templateExerciseLines(copy.id)).toEqual(before);

    // Пока открыт диалог — программу сняли: «Начать» — «Программа недоступна», ничего не создано
    const dialog = await openStart(user.page, p.id);
    await setProgramPublished(p.id, false);
    await dialog.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(user.page.getByText("Программа недоступна")).toBeVisible();
    expect(await templatesOf(user.login)).toHaveLength(1);

    // Из каталога пропала, у занимающегося — идёт
    await user.page.goto("/programs");
    await expect(user.page.getByRole("listitem", { name: p.name })).toHaveCount(0);
    expect((await user.page.goto(`/programs/${p.id}`))?.status()).toBe(404);
    expect(await activeAssignments(user.login)).toEqual([{ name: p.name, coachId: null, catalogProgramId: p.id }]);
    expect(await templateExerciseLines(copy.id)).toEqual(before);
  } finally {
    await user.context.close();
  }
});

test("coach program blocks the start; a catalog program is replaced after confirmation", async ({ page, browser }) => {
  test.slow();
  const a = await publishedProgram(page, { prefix: "Альфа" });
  const author2 = await browser.newContext();
  const user = await athlete(browser);
  try {
    const b = await publishedProgram(await author2.newPage(), { prefix: "Бета" });

    // Две вкладки «Начать» одну программу — одно активное назначение, вторая просит подтвердить замену
    const tab2 = await user.context.newPage();
    const d1 = await openStart(user.page, a.id);
    const d2 = await openStart(tab2, a.id);
    await Promise.all([d1.getByRole("button", { name: "Начать", exact: true }).click(), d2.getByRole("button", { name: "Начать", exact: true }).click()]);
    await expect
      .poll(async () => (await user.page.getByRole("alertdialog").count()) + (await tab2.getByRole("alertdialog").count()))
      .toBe(1);
    expect(await activeAssignments(user.login)).toHaveLength(1);
    await tab2.close();

    // Замена другой каталожной — после подтверждения
    const dialog = await openStart(user.page, b.id);
    await dialog.getByRole("button", { name: "Начать", exact: true }).click();
    const confirm = user.page.getByRole("alertdialog");
    await expect(confirm).toContainText(`Заменить программу «${a.name}»?`);
    await confirm.getByRole("button", { name: "Заменить" }).click();
    await expect(user.page.getByText("Программа начата")).toBeVisible();
    expect(await activeAssignments(user.login)).toEqual([{ name: b.name, coachId: null, catalogProgramId: b.id }]);

    // Тренер назначил программу, пока открыт диалог — запуск запрещён, ничего не создано
    const d3 = await openStart(user.page, a.id);
    await linkCoach(a.coach.login, user.login);
    await seedCoachAssignment(a.coach.login, user.login, "От тренера");
    await d3.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(user.page.getByText("Сейчас идёт программа от тренера")).toBeVisible();
    expect((await activeAssignments(user.login)).map((x) => x.name)).toEqual(["От тренера", b.name]);
    expect(await templatesOf(user.login)).toHaveLength(2);

    // На странице программы — пояснение, кнопка недоступна
    await user.page.goto(`/programs/${a.id}`);
    await expect(user.page.getByText("Сейчас идёт программа от тренера")).toBeVisible();
    await expect(user.page.getByRole("button", { name: "Начать программу" })).toBeDisabled();
  } finally {
    await user.context.close();
    await author2.close();
  }
});

test("ending the own program removes future sessions and keeps today's", async ({ page, browser }) => {
  test.slow();
  const p = await publishedProgram(page, { weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const user = await athlete(browser);
  try {
    await startProgram(user.page, p.id, "this");
    expect(await programSeriesToday(user.login)).toBe(1);

    await user.page.goto("/calendar");
    const block = user.page.getByRole("region", { name: "Программа" });
    await expect(block).toContainText(`«${p.name}»`);
    await expect(block).toContainText("неделя 1 из 8");
    await block.getByRole("button", { name: "Завершить программу" }).click();
    await user.page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
    await expect(user.page.getByText("Программа завершена")).toBeVisible();
    await expect(user.page.getByRole("region", { name: "Программа" })).toHaveCount(0);

    expect(await programSeriesToday(user.login)).toBe(1);
    expect(await programSeriesAfterToday(user.login)).toBe(0);
    expect(await activeAssignments(user.login)).toEqual([]);
    await user.page.goto(`/programs/${p.id}`);
    await expect(user.page.getByText("занимаются 0")).toBeVisible();
  } finally {
    await user.context.close();
  }
});
