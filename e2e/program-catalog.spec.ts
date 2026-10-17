import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  activeAssignments,
  coachNotifications,
  coachProfile,
  coachRecapRows,
  coachTemplate,
  enableCoach,
  linkCoach,
  makeAdmin,
  notificationTitles,
  programSeriesAfterToday,
  programSeriesToday,
  resetFlag,
  seedCoachAssignment,
  seedCoachProgram,
  setFlag,
  setNickname,
  setProgramPublished,
  shiftProgramStart,
  templateExerciseLines,
  templatesOf,
  withDb,
} from "./db";
import { PASSWORD, registerUser, runTick } from "./helpers";

// Каталог программ тренеров — под глобальным флагом program_catalog: сценарии по очереди, только desktop
test.describe.configure({ mode: "serial" });
// Каталог постраничный (20), а база e2e копит программы прошлых прогонов — они вытесняют новые с первой страницы
test.beforeAll(async ({}, info) => {
  if (info.project.name === "desktop") await withDb((db) => db.query(`update "CoachProgram" set "publishedAt" = null where "publishedAt" is not null`));
});
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

/** Выгрузка «Все данные (JSON)» из настроек. */
async function exportJson(page: Page) {
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

async function deleteAccount(page: Page) {
  await page.goto("/settings");
  await page.getByRole("region", { name: "Удаление аккаунта" }).getByRole("button", { name: "Удалить аккаунт" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Удалить аккаунт?" });
  await dialog.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(page).toHaveURL(/deleted=1/);
}

test("my data: the author exports published programs, the user exports the launch from the catalog", async ({ page, browser }) => {
  test.slow();
  const p = await publishedProgram(page, { weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const user = await athlete(browser);
  const userNick = nickOf(user.login, "Athl");
  await setNickname(user.login, userNick);
  try {
    await startProgram(user.page, p.id);

    const mine = await exportJson(user.page);
    expect(mine.programs).toEqual([expect.objectContaining({ name: p.name, fromCatalog: true, catalogProgram: { name: p.name, author: p.nick } })]);
    expect(JSON.stringify(mine)).not.toContain(p.id);
    expect(mine.publishedPrograms).toEqual([]);

    const author = await exportJson(page);
    expect(author.publishedPrograms).toEqual([expect.objectContaining({ name: p.name, description: "Описание", hiddenAt: null, participants: 1 })]);
    // Ни ников, ни данных занимающихся — только число
    expect(JSON.stringify(author)).not.toContain(user.login);
    expect(JSON.stringify(author)).not.toContain(userNick);
  } finally {
    await user.context.close();
  }
});

test("my data: the author deletes the account — the user's program goes on, the copied template keeps the author's exercise, the workout starts without it", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  const name = `Сила ${nick}`;
  const template = `Ноги ${nick}`;
  const own = `Свой присед ${nick}`;
  const templateId = await coachTemplate(coach.login, template, own);
  const programId = await seedCoachProgram(coach.login, templateId, { name, weekdays: [0, 1, 2, 3, 4, 5, 6], publish: true, description: "Описание" });
  const user = await athlete(browser);
  try {
    await startProgram(user.page, programId, "this");
    await deleteAccount(page);

    expect(await activeAssignments(user.login)).toEqual([{ name, coachId: null, catalogProgramId: null }]);
    const mine = await exportJson(user.page);
    expect(mine.programs).toEqual([expect.objectContaining({ name, fromCatalog: true, catalogProgram: null, ended: false })]);

    // Копия шаблона открывается; упражнение автора переехало к пользователю архивной копией
    const copy = (await templatesOf(user.login)).find((t) => t.name === template)!;
    await user.page.goto(`/templates/${copy.id}`);
    await expect(user.page.getByText(own).first()).toBeVisible();

    // Тренировка по плану стартует; архивные упражнения при запуске из шаблона пропускаются (как и раньше)
    await user.page.goto("/training");
    await user.page.getByRole("button", { name: new RegExp(`По плану: ${template}`) }).click();
    await expect(user.page.getByRole("region", { name: SQUAT })).toBeVisible();
    await expect(user.page.getByRole("region", { name: own })).toHaveCount(0);
    await expect(user.page.getByRole("button", { name: "Начать", exact: true })).toBeVisible();
  } finally {
    await user.context.close();
  }
});

test("a user edits the copied template with the author's exercise; a foreign exercise is still rejected", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  const name = `Сила ${nick}`;
  const template = `Ноги ${nick}`;
  const own = `Свой присед ${nick}`;
  const templateId = await coachTemplate(coach.login, template, own);
  const programId = await seedCoachProgram(coach.login, templateId, { name, weekdays: [0, 1, 2, 3, 4, 5, 6], publish: true, description: "Описание" });
  const user = await athlete(browser);
  try {
    await startProgram(user.page, programId, "this");
    const copy = (await templatesOf(user.login)).find((t) => t.name === template)!;

    // Переименование и порядок: упражнение автора уже стоит в копии — сохраняется
    await user.page.goto(`/templates/${copy.id}`);
    await user.page.getByLabel("Название").fill(`${template} мой`);
    await user.page.getByRole("region", { name: own }).getByRole("button", { name: "Выше" }).click();
    await user.page.getByRole("button", { name: "Сохранить шаблон" }).click();
    await expect(user.page.getByText("Шаблон сохранён")).toBeVisible();
    expect(await templateExerciseLines(copy.id)).toEqual([`${SQUAT} 3×10`, `${own} 3×10`, "Жим ногами 3×10"]);
    expect((await templatesOf(user.login)).find((t) => t.id === copy.id)?.name).toBe(`${template} мой`);

    // Подмена id на чужое упражнение, которого в шаблоне не было, — по-прежнему ошибка
    const [squatId, foreignId] = await withDb(async (db) => {
      const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where "userId" is null and name = $1`, [SQUAT]);
      // Своё упражнение автора, которого нет в программе
      const { rows: other } = await db.query<{ id: string }>(
        `insert into "Exercise" (id, "userId", name, "muscleGroups", "updatedAt") values (gen_random_uuid()::text, (select id from "User" where login = $1), $2, '{LEGS}', now()) returning id`,
        [coach.login, `Чужое ${nick}`],
      );
      return [rows[0].id, other[0].id];
    });
    await user.page.goto(`/templates/${copy.id}`);
    await user.page.route(`**/templates/${copy.id}`, async (route) => {
      const body = route.request().postData();
      if (route.request().method() !== "POST" || !body?.includes(squatId)) return route.continue();
      await route.continue({ postData: body.replaceAll(squatId, foreignId) });
    });
    await user.page.getByRole("button", { name: "Сохранить шаблон" }).click();
    await expect(user.page.getByText("Неизвестное упражнение")).toBeVisible();
    expect(await templateExerciseLines(copy.id)).toEqual([`${SQUAT} 3×10`, `${own} 3×10`, "Жим ногами 3×10"]);
  } finally {
    await user.context.close();
  }
});

test("a coach publishes a program and a user sees it in the catalog", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  await coachProfile(coach.login, { about: "Тренер", publish: true });
  const name = `Сила ${nick}`;
  const templateId = await coachTemplate(coach.login, `Ноги ${nick}`);
  const programId = await seedCoachProgram(coach.login, templateId, { name, weekdays: [0, 2, 4] });

  // Автор видит свою неопубликованную программу со значком
  await page.goto(`/programs/${programId}`);
  await expect(page.getByText("Не опубликована")).toBeVisible();

  await page.goto("/coach/programs");
  // Новая программа: публикация — после сохранения
  await page.getByRole("button", { name: "Новая программа" }).click();
  await expect(page.getByRole("dialog")).toContainText("Сохраните программу, чтобы опубликовать её в каталоге");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
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
    await userPage.getByRole("link", { name: "Каталог программ" }).first().click();
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
  await expect(page.getByRole("link", { name: "Каталог программ" })).toHaveCount(0);

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
    await expect(squat).toContainText(`программа «${p.name}»: 3 × 10 · 100 кг (неделя 1/8)`);

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
    // Ссылка — в календарь: страница каталога без флага — 404
    const urls = await withDb(async (db) => {
      const { rows } = await db.query<{ url: string }>(
        `select n.url from "Notification" n join "User" u on u.id = n."userId" where u.login = $1 and n.title like '%заканчивается через неделю'`,
        [user.login],
      );
      return rows.map((r) => r.url);
    });
    expect(urls).toEqual(["/calendar"]);
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
    await expect(block.getByRole("link", { name: "страница программы" })).toHaveAttribute("href", `/programs/${p.id}`);
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

test("the flag is turned off while a catalog program runs — the user can still end it", async ({ page, browser }) => {
  test.slow();
  const p = await publishedProgram(page, { weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const user = await athlete(browser);
  try {
    await startProgram(user.page, p.id, "this");
    await setFlag("program_catalog", { enabled: false });

    await user.page.goto("/calendar");
    const block = user.page.getByRole("region", { name: "Программа" });
    await expect(block).toContainText(`«${p.name}»`);
    // Каталога нет — нет и ссылки на страницу программы
    await expect(block.getByRole("link", { name: "страница программы" })).toHaveCount(0);
    await block.getByRole("button", { name: "Завершить программу" }).click();
    await user.page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
    await expect(user.page.getByText("Программа завершена")).toBeVisible();
    await expect(user.page.getByRole("region", { name: "Программа" })).toHaveCount(0);
    expect(await activeAssignments(user.login)).toEqual([]);
    expect(await programSeriesAfterToday(user.login)).toBe(0);
  } finally {
    await user.context.close();
  }
});

test("the author deletes the program — the running one keeps its label, weights and the end button", async ({ page, browser }) => {
  test.slow();
  const p = await publishedProgram(page, { weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const user = await athlete(browser);
  try {
    const dialog = await openStart(user.page, p.id, "this");
    await dialog.getByLabel(`База, ${SQUAT} (${p.template})`).fill("100");
    await dialog.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(user.page.getByText("Программа начата")).toBeVisible();

    // Автор удалил программу из библиотеки: ссылка на каталог обнулилась, признак запуска из каталога остался
    await withDb((db) => db.query(`delete from "CoachProgram" where id = $1`, [p.id]));
    expect(await activeAssignments(user.login)).toEqual([{ name: p.name, coachId: null, catalogProgramId: null }]);

    await user.page.goto("/calendar");
    const block = user.page.getByRole("region", { name: "Программа" });
    await expect(block).toContainText(`«${p.name}»`);
    await expect(block.getByRole("button", { name: "Завершить программу" })).toBeVisible();
    await expect(block.getByRole("link", { name: "страница программы" })).toHaveCount(0);
    await expect(user.page.getByRole("button", { name: new RegExp(`^${p.template}, .*, программа «${p.name}» \\(неделя 1/8\\)$`) })).not.toHaveCount(0);

    await user.page.goto("/training");
    await user.page.getByRole("button", { name: new RegExp(`По плану: ${p.template}`) }).click();
    const squat = user.page.getByRole("region", { name: SQUAT });
    await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("100");
    await expect(squat).toContainText(`программа «${p.name}»: 3 × 10 · 100 кг (неделя 1/8)`);
  } finally {
    await user.context.close();
  }
});

test("an admin hides a program with a reason", async ({ page, browser }) => {
  test.slow();
  const p = await publishedProgram(page);
  const user = await athlete(browser);
  const adminContext = await browser.newContext();
  try {
    const adminPage = await adminContext.newPage();
    const admin = await registerUser(adminPage, "Админ");
    await makeAdmin(admin.login);

    await adminPage.goto("/admin/programs");
    const row = adminPage.getByRole("listitem", { name: p.name });
    await expect(row).toContainText(p.nick);
    await expect(row).toContainText("занимаются 0");
    await expect(row).toContainText("В каталоге");

    // Причина обязательна
    await row.getByRole("button", { name: "Снять" }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("button", { name: "Снять" }).click();
    await expect(dialog.getByText("Укажите причину")).toBeVisible();
    await dialog.getByLabel("Причина").fill("Опасная схема нагрузки");
    await dialog.getByRole("button", { name: "Снять" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Снята");

    // Автор получил уведомление
    expect(await coachNotifications(p.coach.login)).toEqual([
      { title: `Программа «${p.name}» снята из каталога: Опасная схема нагрузки`, url: "/coach/programs" },
    ]);

    // Пользователю — нет в каталоге и 404
    await user.page.goto("/programs");
    await expect(user.page.getByRole("listitem", { name: p.name })).toHaveCount(0);
    expect((await user.page.goto(`/programs/${p.id}`))?.status()).toBe(404);

    // В редакторе — пометка, переключатель недоступен
    await page.goto("/coach/programs");
    await page.getByRole("button", { name: `Изменить «${p.name}»` }).click();
    const editor = page.getByRole("dialog");
    await expect(editor).toContainText("Снята администратором: Опасная схема нагрузки");
    await expect(editor.getByRole("switch", { name: "Опубликовать в каталоге" })).toBeDisabled();
    await page.keyboard.press("Escape");
    // Страница программы у автора — со значком снятия
    await page.goto(`/programs/${p.id}`);
    await expect(page.getByText("Снята администратором")).toBeVisible();

    // Вернуть — снова в каталоге, без нового уведомления
    await adminPage.reload();
    await adminPage.getByRole("listitem", { name: p.name }).getByRole("button", { name: "Вернуть" }).click();
    await expect(adminPage.getByRole("listitem", { name: p.name })).toContainText("В каталоге");
    // Каталог постраничный, а база e2e копит программы прошлых прогонов — проверяем страницу программы
    expect((await user.page.goto(`/programs/${p.id}`))?.status()).toBe(200);
    await expect(user.page.getByRole("button", { name: "Начать программу" })).toBeEnabled();
    expect(await coachNotifications(p.coach.login)).toHaveLength(1);
  } finally {
    await user.context.close();
    await adminContext.close();
  }
});
