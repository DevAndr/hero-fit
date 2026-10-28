import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, courseReminderPushes, courseReminders, setCourseRemindDays, setCourseSession, setTimeZone } from "./db";
import { registerUser, runTick } from "./helpers";
import { E2E_TZ, localAt } from "./tz";

const COURSE = "Курс «Сесть на шпагат»";
const SIDE = "Поперечный шпагат";

async function courseUser(page: Page, name: string) {
  const u = await registerUser(page, name);
  await addFlagUser("stretching", u.login);
  await addFlagUser("stretch_course", u.login);
  return u;
}

/** Старт курса из карточки на /stretching: вид, дни по умолчанию, стартовый замер. */
async function startCourse(page: Page, skill: string, cm: string) {
  await page.goto("/stretching");
  const card = page.getByRole("region", { name: COURSE });
  await card.getByRole("button", { name: "Начать курс" }).click();
  const dialog = page.getByRole("dialog", { name: "Начать курс" });
  await dialog.getByRole("radio", { name: skill }).click();
  await expect(dialog.getByRole("checkbox", { name: "пн" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "ср" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "пт" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "вт" })).not.toBeChecked();
  await expect(dialog).toContainText("не до боли");
  await dialog.getByLabel("Сейчас, см до пола").fill(cm);
  await dialog.getByRole("button", { name: "Начать курс" }).click();
  await expect(dialog).toBeHidden();
  return card;
}

/** «Начать занятие» → /training (тренировка плановая) → «Начать». */
async function startSession(page: Page) {
  await page.goto("/stretching");
  await page.getByRole("region", { name: COURSE }).getByRole("button", { name: "Начать занятие" }).click();
  await expect(page).toHaveURL(/\/training$/);
  await page.getByRole("button", { name: "Начать", exact: true }).click();
}

async function doneFirstSet(page: Page, exercise: string) {
  await page.getByRole("region", { name: exercise, exact: true }).getByRole("button", { name: "Подход 1 выполнен" }).click();
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

async function cancelWorkout(page: Page) {
  await page.getByRole("button", { name: "Действия с тренировкой" }).click();
  await page.getByRole("menuitem", { name: "Отменить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отменить тренировку" }).click();
  await expect(page.getByRole("button", { name: /Пустая тренировка/ })).toBeVisible();
}

test("start a course: skill goal with the start measurement, first session 30 s holds and the measurement banner, finishing moves to session 2", async ({ page }) => {
  test.slow();
  await courseUser(page, "Курс_шпагат");
  await page.goto("/stretching");
  const card = page.getByRole("region", { name: COURSE });
  await expect(card).toContainText("10 недель, 30 занятий");

  await startCourse(page, SIDE, "25");
  await expect(card).toContainText(SIDE);
  await expect(card.getByTestId("course-progress")).toHaveText("Этап 1 из 5 · Занятие 1 из 30");
  await expect(card).toContainText("Последний замер: 25 см");
  await expect(page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: SIDE })).toContainText("Осталось 25 см");

  await startSession(page);
  await expect(page.getByTestId("course-line")).toHaveText("Курс: этап 1 · занятие 1 из 30");
  await expect(page.getByText("Разомнитесь 5 минут: ходьба, махи ногами. Не до боли")).toBeVisible();
  await expect(page.getByRole("region", { name: "Бабочка", exact: true }).getByLabel("Время, подход 1")).toHaveValue("0:30");
  const measure = page.getByRole("region", { name: "Замер: см до пола" });
  await measure.getByLabel("Замер, см").fill("24");
  await measure.getByRole("button", { name: "Сохранить" }).click();
  await expect(measure).toBeHidden();

  await doneFirstSet(page, "Бабочка");
  await finish(page);
  await expect(page.getByTestId("summary-course")).toHaveText("Занятие 1 из 30 пройдено · следующее — этап 1, 30 с");

  await page.goto("/stretching");
  await expect(card.getByTestId("course-progress")).toHaveText("Этап 1 из 5 · Занятие 2 из 30");
  await expect(card).toContainText("Последний замер: 24 см");
});

test("a cancelled course session does not move the course", async ({ page }) => {
  await courseUser(page, "Курс_отмена");
  const card = await startCourse(page, SIDE, "30");
  await startSession(page);
  await expect(page.getByTestId("course-line")).toBeVisible();
  await cancelWorkout(page);
  await page.goto("/stretching");
  await expect(card.getByTestId("course-progress")).toHaveText("Этап 1 из 5 · Занятие 1 из 30");
});

test("finishing with no set checked does not count", async ({ page }) => {
  await courseUser(page, "Курс_пусто");
  const card = await startCourse(page, SIDE, "30");
  await startSession(page);
  // Пустую тренировку редактор не завершает; занятие отменяем
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page.getByText("Отметьте хотя бы один выполненный подход")).toBeVisible();
  await expect(page).toHaveURL(/\/training$/);
  // отказ сервера сам закрывает диалог подтверждения (queueFinish → "rejected")
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await cancelWorkout(page);
  await page.goto("/stretching");
  await expect(card.getByTestId("course-progress")).toHaveText("Этап 1 из 5 · Занятие 1 из 30");
});

test("an existing skill goal is reused", async ({ page }) => {
  await courseUser(page, "Курс_цель");
  await page.goto(`/stretching?skill=SPLIT_SIDE`);
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await dialog.getByLabel("Замер сейчас, см").fill("30");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();

  await startCourse(page, SIDE, "28");
  const goals = page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: SIDE });
  await expect(goals).toHaveCount(1);
  await expect(goals).toContainText("Осталось 28 см");
});

test("final: session 30 → summary, «Закрепить» → maintenance", async ({ page }) => {
  test.slow();
  const u = await courseUser(page, "Курс_финал");
  const card = await startCourse(page, SIDE, "25");
  await setCourseSession(u.login, 30);
  await startSession(page);
  await expect(page.getByTestId("course-line")).toHaveText("Курс: этап 5 · занятие 30 из 30");
  await page.getByRole("region", { name: "Замер: см до пола" }).getByRole("button", { name: "Пропустить" }).click();
  await doneFirstSet(page, "Бабочка");
  await finish(page);
  await expect(page.getByTestId("summary-course")).toContainText("Курс пройден");

  await page.goto("/stretching");
  await expect(card).toContainText("Было 25 см");
  await expect(card.getByRole("button", { name: "Пройти заново" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Закончить" })).toBeVisible();
  // на итоговой карточке бросать курс нельзя
  await card.getByRole("button", { name: "Действия с курсом" }).click();
  await expect(page.getByRole("menuitem", { name: "Дни напоминаний" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Бросить курс" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Дни напоминаний" })).toBeHidden();
  await card.getByRole("button", { name: "Закрепить" }).click();
  await expect(card.getByTestId("course-progress")).toContainText("Поддержка");

  await card.getByRole("button", { name: "Начать занятие" }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByLabel("Название тренировки")).toHaveValue("Шпагат · поддержка");
  await expect(page.getByTestId("course-line")).toHaveText("Курс: поддержка");
  await expect(page.getByRole("region", { name: "Замер: см до пола" })).toHaveCount(0);
});

test("«Пройти заново» opens the start dialog with the same skill", async ({ page }) => {
  const u = await courseUser(page, "Курс_заново");
  const card = await startCourse(page, "Продольный шпагат (правая впереди)", "40");
  await setCourseSession(u.login, 30);
  await startSession(page);
  await doneFirstSet(page, "Голубь");
  await finish(page);
  await page.goto("/stretching");
  await card.getByRole("button", { name: "Пройти заново" }).click();
  const dialog = page.getByRole("dialog", { name: "Начать курс" });
  await expect(dialog.getByRole("radio", { name: "Продольный шпагат (правая впереди)" })).toBeChecked();
  await dialog.getByLabel("Сейчас, см до пола").fill("38");
  await dialog.getByRole("button", { name: "Начать курс" }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByTestId("course-progress")).toHaveText("Этап 1 из 5 · Занятие 1 из 30");
});

test("skill goal deleted mid-course: no measurement banner, course goes on", async ({ page }) => {
  const u = await courseUser(page, "Курс_без_цели");
  await startCourse(page, SIDE, "25");
  const goal = page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: SIDE });
  await goal.getByRole("button", { name: "Действия с целью" }).click();
  await page.getByRole("menuitem", { name: "Удалить" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
  await expect(goal).toBeHidden();

  await setCourseSession(u.login, 7);
  await startSession(page);
  await expect(page.getByTestId("course-line")).toHaveText("Курс: этап 2 · занятие 7 из 30");
  await expect(page.getByRole("region", { name: "Замер: см до пола" })).toHaveCount(0);
});

test("days and abandoning from the «⋯» menu", async ({ page }) => {
  await courseUser(page, "Курс_меню");
  const card = await startCourse(page, SIDE, "25");
  await card.getByRole("button", { name: "Действия с курсом" }).click();
  await page.getByRole("menuitem", { name: "Дни напоминаний" }).click();
  const days = page.getByRole("dialog", { name: "Дни напоминаний" });
  await expect(days.getByRole("checkbox", { name: "ср" })).toBeChecked();
  await days.getByRole("checkbox", { name: "сб" }).click();
  await days.getByRole("button", { name: "Сохранить" }).click();
  await expect(days).toBeHidden();
  await card.getByRole("button", { name: "Действия с курсом" }).click();
  await page.getByRole("menuitem", { name: "Дни напоминаний" }).click();
  await expect(days.getByRole("checkbox", { name: "сб" })).toBeChecked();
  await expect(days.getByRole("checkbox", { name: "ср" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(days).toBeHidden();

  await card.getByRole("button", { name: "Действия с курсом" }).click();
  await page.getByRole("menuitem", { name: "Бросить курс" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Бросить курс" }).click();
  await expect(card.getByRole("button", { name: "Начать курс" })).toBeVisible();
  await expect(card).toContainText("10 недель, 30 занятий");
});

test("without stretch_course there is no course card", async ({ page }) => {
  const u = await registerUser(page, "Курс_без_флага");
  await addFlagUser("stretching", u.login);
  await page.goto("/stretching");
  await expect(page.getByRole("region", { name: "Цели по растяжке" })).toBeVisible();
  await expect(page.getByRole("region", { name: COURSE })).toHaveCount(0);
});

/** Сегодняшний местный день в поясе e2e и его день недели (0 = пн). */
function todayLocal() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { day, weekday: (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 };
}

test("reminder: on a chosen day after 17:00 once; the toggle off — none", async ({ page, request, browser }) => {
  const { day, weekday } = todayLocal();
  const a = await courseUser(page, "Курс_напомин");
  await startCourse(page, SIDE, "25");
  await setTimeZone(a.login);
  await setCourseRemindDays(a.login, [weekday]);

  await runTick(request, localAt(day, "16:30"), "course");
  expect(await courseReminders(a.login)).toEqual([]);
  await runTick(request, localAt(day, "17:30"), "course");
  await runTick(request, localAt(day, "18:30"), "course");
  expect(await courseReminders(a.login)).toEqual(["Сегодня занятие курса: этап 1, занятие 1 из 30"]);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
  await expect(page.getByText("Сегодня занятие курса: этап 1, занятие 1 из 30")).toBeVisible();

  const ctx = await browser.newContext();
  page = await ctx.newPage();
  const b = await courseUser(page, "Курс_без_напомин");
  await startCourse(page, SIDE, "25");
  await setTimeZone(b.login);
  await setCourseRemindDays(b.login, [weekday]);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Курс растяжки — занятия по дням" }).click();
  await expect(page.getByRole("switch", { name: "Курс растяжки — занятия по дням" })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Курс растяжки — занятия по дням" })).not.toBeChecked();
  await runTick(request, localAt(day, "17:30"), "course");
  // тумблер гасит push (запись в ленте остаётся, как у остальных типов); у первого пользователя push был
  expect(await courseReminderPushes(b.login)).toBe(0);
  expect(await courseReminderPushes(a.login)).toBe(1);
  await ctx.close();
});
