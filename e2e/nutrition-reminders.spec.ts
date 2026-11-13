import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addFlagUser,
  addFoodEntry,
  addMealReminder,
  addSubscription,
  setNutritionMacros,
  deleteMealReminderAt,
  deleteMealReminders,
  linkTelegram,
  mealReminderNotifications,
  mealReminders,
  setTimeZone,
} from "./db";
import { registerUser, runTick } from "./helpers";
import { E2E_TZ, localAt } from "./tz";
import { formatTime, localMinutes } from "@/lib/nutrition/reminders";

const localDay = (plusDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + plusDays * 86_400_000),
  );

const tick = (request: Parameters<typeof runTick>[0], at: Date) => runTick(request, at, "meals");

/**
 * Время напоминания, окно которого `[m, m + span)` не задевают чужие тики без шага: полные тики
 * `notifications.spec.ts` идут с часами 15:00 UTC прошлой субботы, а фоновый воркер и спеки без часов — с реальным
 * «сейчас» (на старте прогона местные 12:xx, дальше — до ~14:00). Берём `preferred`, при коллизии — `alternative`.
 */
function safeMinutes(preferred: number, alternative: number, span = 60): number {
  const saturday = localMinutes(new Date("2026-11-07T15:00:00Z"), E2E_TZ);
  const busy = (m: number) => (saturday >= m && saturday < m + span) || (m < 840 && m + span > 720);
  return busy(preferred) ? alternative : preferred;
}

/** Момент «сегодня/завтра в минуты m» в поясе e2e. */
const at = (day: string, minutes: number) => localAt(day, formatTime(minutes));

/** Пользователи теста — их напоминания убираются в конце, чтобы не срабатывать в следующих прогонах. */
const created: string[] = [];

async function reminderUser(page: Page, withFlag = true) {
  const me = await registerUser(page);
  created.push(me.login);
  if (withFlag) await addFlagUser("nutrition", me.login);
  // Режим ввода выбран — иначе на /nutrition откроется окно выбора режима и закроет страницу
  if (withFlag) await setNutritionMacros(me.login, false);
  await setTimeZone(me.login);
  return me;
}

async function openWindow(page: Page) {
  await page.goto("/nutrition");
  await page.getByRole("button", { name: "Настройки итога дня" }).click();
  await page.getByRole("menuitem", { name: "Напоминания…" }).click();
  const dialog = page.getByRole("dialog", { name: "Напоминания о приёмах пищи" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const addButton = (dialog: Locator) => dialog.getByRole("button", { name: "Добавить напоминание" });

test.describe("тик", () => {
  // Тик по шагу идёт по всем напоминаниям базы: тесты в одно время задевали бы друг друга (и десктоп с мобильным)
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "Тик общий для всей базы — только desktop");
  });
  test.afterEach(async () => {
    for (const login of created.splice(0)) await deleteMealReminders(login);
  });

  test("в заданное время приходит напоминание об обеде, один раз за день", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m });

    await tick(request, at(today, m));
    expect(await mealReminderNotifications(me.login)).toEqual([{ title: `Обед · ${formatTime(m)}`, body: "Запишите обед в дневник" }]);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(page.getByText("Запишите обед в дневник")).toBeVisible();

    await tick(request, at(today, m + 5));
    expect(await mealReminderNotifications(me.login)).toHaveLength(1);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);
  });

  test("обед уже записан — уведомления нет, день решён", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m });
    await addFoodEntry(me.login, { date: today, meal: "LUNCH", name: "Суп", kcal: 300 });

    await tick(request, at(today, m));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);
  });

  test("записан только завтрак — про обед напоминает", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m });
    await addFoodEntry(me.login, { date: today, meal: "BREAKFAST", name: "Овсянка", kcal: 300 });

    await tick(request, at(today, m));
    expect(await mealReminderNotifications(me.login)).toHaveLength(1);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);
  });

  test("за минуту до времени и через час — не напоминает, день не ставится", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m });

    await tick(request, at(today, m - 1));
    await tick(request, at(today, m + 60));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBeNull();
  });

  test("выключенное напоминание не приходит и день не ставится", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m, enabled: false });

    await tick(request, at(today, m));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBeNull();
  });

  test("без флага nutrition не приходит, день решён", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960);
    const me = await reminderUser(page, false);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m });

    await tick(request, at(today, m));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);
  });

  test("напоминание в начале суток и тик через 10 минут следующих местных суток — приходит, день — завтрашний", async ({ page, request }) => {
    const tomorrow = localDay(1);
    const m = safeMinutes(30, 210);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "SNACK", minutes: m });

    await tick(request, at(tomorrow, m + 10));
    expect(await mealReminderNotifications(me.login)).toHaveLength(1);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(tomorrow);
  });

  test("два напоминания одного пользователя — два уведомления", async ({ page, request }) => {
    const today = localDay();
    const m = safeMinutes(840, 960, 90);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: m });
    await addMealReminder(me.login, { meal: "SNACK", minutes: m + 30 });

    await tick(request, at(today, m + 40));
    // Оба в одном тике — порядок создания не гарантирован
    const sent = await mealReminderNotifications(me.login);
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining([
        { title: `Обед · ${formatTime(m)}`, body: "Запишите обед в дневник" },
        { title: `Перекус · ${formatTime(m + 30)}`, body: "Запишите перекус в дневник" },
      ]),
    );
  });

  test("добавленное после 09:00 и перенесённое на более позднее время сегодня — приходит в новое время", async ({ page, request }) => {
    const today = localDay();
    const later = safeMinutes(1080, 1200);
    const nowMin = localMinutes(new Date(), E2E_TZ);
    test.skip(nowMin < 540 || nowMin >= later, "Нужно местное время между 09:00 и новым временем напоминания");
    const me = await reminderUser(page);
    const dialog = await openWindow(page);

    // Время по умолчанию (09:00) уже прошло — строка создаётся с сегодняшним днём
    await addButton(dialog).click();
    const time = dialog.getByLabel("Время напоминания");
    await expect(time).toHaveValue("09:00");
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);

    await time.fill(formatTime(later));
    await time.blur();
    await expect.poll(async () => (await mealReminders(me.login))[0].minutes).toBe(later);
    expect((await mealReminders(me.login))[0].remindedDay).toBeNull();

    await tick(request, at(today, later));
    expect(await mealReminderNotifications(me.login)).toEqual([{ title: `Завтрак · ${formatTime(later)}`, body: "Запишите завтрак в дневник" }]);
  });
});

test.describe("окно", () => {
  // Тики соседних тестов обрабатывают все включённые напоминания базы — убираем свои, чтобы не мешать им
  test.afterEach(async () => {
    for (const login of created.splice(0)) await deleteMealReminders(login);
  });

  test("добавление: завтрак 09:00, потом обед 14:00; после перезагрузки на месте по порядку времени", async ({ page }) => {
    const me = await reminderUser(page);
    const dialog = await openWindow(page);
    await expect(dialog.getByText("Напоминаний пока нет")).toBeVisible();
    await expect(dialog.getByText("Придёт в выбранное время, если приём ещё не записан")).toBeVisible();

    await addButton(dialog).click();
    await expect(dialog.getByLabel("Время напоминания")).toHaveValue("09:00");
    await expect(dialog.getByRole("combobox", { name: "Приём пищи" })).toContainText("Завтрак");
    await expect(dialog.getByRole("switch", { name: "Напоминание 09:00 включено" })).toBeChecked();

    await addButton(dialog).click();
    await expect(dialog.getByLabel("Время напоминания")).toHaveCount(2);
    await expect(dialog.getByLabel("Время напоминания").nth(1)).toHaveValue("14:00");
    await expect(dialog.getByRole("combobox", { name: "Приём пищи" }).nth(1)).toContainText("Обед");

    await page.reload();
    await page.getByRole("button", { name: "Настройки итога дня" }).click();
    await page.getByRole("menuitem", { name: "Напоминания…" }).click();
    const again = page.getByRole("dialog", { name: "Напоминания о приёмах пищи" });
    await expect(again.getByLabel("Время напоминания")).toHaveCount(2);
    await expect(again.getByLabel("Время напоминания").nth(0)).toHaveValue("09:00");
    await expect(again.getByLabel("Время напоминания").nth(1)).toHaveValue("14:00");
    expect((await mealReminders(me.login)).map((r) => [r.meal, r.minutes])).toEqual([
      ["BREAKFAST", 540],
      ["LUNCH", 840],
    ]);
  });

  test("смена времени и приёма, выключение — сохраняется и видно после перезагрузки", async ({ page }) => {
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "BREAKFAST", minutes: 540 });
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    const dialog = await openWindow(page);

    const time = dialog.getByLabel("Время напоминания").first();
    await time.fill("08:15");
    await time.blur();
    await expect.poll(async () => (await mealReminders(me.login))[0].minutes).toBe(495);

    const meal = dialog.getByRole("combobox", { name: "Приём пищи" }).first();
    await meal.click();
    await page.getByRole("option", { name: "Перекус" }).click();
    await expect.poll(async () => (await mealReminders(me.login))[0].meal).toBe("SNACK");

    await dialog.getByRole("switch", { name: "Напоминание 08:15 включено" }).click();
    await expect.poll(async () => (await mealReminders(me.login))[0].enabled).toBe(false);
    expect(await mealReminders(me.login)).toMatchObject([
      { meal: "SNACK", minutes: 495, enabled: false },
      { meal: "LUNCH", minutes: 840, enabled: true },
    ]);

    await page.reload();
    await page.getByRole("button", { name: "Настройки итога дня" }).click();
    await page.getByRole("menuitem", { name: "Напоминания…" }).click();
    const again = page.getByRole("dialog", { name: "Напоминания о приёмах пищи" });
    await expect(again.getByLabel("Время напоминания").first()).toHaveValue("08:15");
    await expect(again.getByRole("combobox", { name: "Приём пищи" }).first()).toContainText("Перекус");
    await expect(again.getByRole("switch", { name: "Напоминание 08:15 включено" })).not.toBeChecked();
  });

  test("удаление строки", async ({ page }) => {
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "SNACK", minutes: 495 });
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    const dialog = await openWindow(page);

    await dialog.getByRole("button", { name: "Удалить напоминание 08:15" }).click();
    await expect(dialog.getByLabel("Время напоминания")).toHaveCount(1);
    await expect(dialog.getByLabel("Время напоминания")).toHaveValue("14:00");
    await expect.poll(async () => (await mealReminders(me.login)).map((r) => r.minutes)).toEqual([840]);
  });

  test("шесть напоминаний — добавить нельзя, виден лимит", async ({ page }) => {
    const me = await reminderUser(page);
    for (const [i, meal] of (["BREAKFAST", "LUNCH", "DINNER", "SNACK", "SNACK", "SNACK"] as const).entries()) {
      await addMealReminder(me.login, { meal, minutes: 420 + i * 60 });
    }
    const dialog = await openWindow(page);
    await expect(addButton(dialog)).toBeDisabled();
    await expect(dialog.getByText("Не больше 6 напоминаний")).toBeVisible();
  });

  test("время, уже занятое другим напоминанием, отклоняется — прежнее время в поле и в базе", async ({ page }) => {
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "BREAKFAST", minutes: 540 });
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    const dialog = await openWindow(page);

    const second = dialog.getByLabel("Время напоминания").nth(1);
    await second.fill("09:00");
    await second.blur();
    await expect(page.getByText("На это время уже есть напоминание")).toBeVisible();
    await expect(second).toHaveValue("14:00");
    expect((await mealReminders(me.login)).map((r) => r.minutes)).toEqual([540, 840]);
  });

  test("быстрые двойные клики не обходят лимит; строка, удалённая за спиной интерфейса, не роняет страницу", async ({ page }) => {
    const me = await reminderUser(page);
    for (const [i, meal] of (["BREAKFAST", "LUNCH", "DINNER", "SNACK", "SNACK"] as const).entries()) {
      await addMealReminder(me.login, { meal, minutes: 420 + i * 60 });
    }
    const errors: Error[] = [];
    page.on("pageerror", (e) => errors.push(e));
    const dialog = await openWindow(page);

    const add = addButton(dialog);
    await add.click({ noWaitAfter: true });
    await add.click({ noWaitAfter: true, force: true }).catch(() => {});
    await expect.poll(async () => (await mealReminders(me.login)).length).toBe(6);
    await expect(dialog.getByLabel("Время напоминания")).toHaveCount(6);
    expect(await mealReminders(me.login)).toHaveLength(6);

    // Строка исчезла в базе, а интерфейс про это не знает
    await deleteMealReminderAt(me.login, 420);
    await dialog.getByRole("switch", { name: "Напоминание 07:00 включено" }).click();
    await expect(page.getByText("Напоминание не найдено — обновите страницу")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("пустое поле времени возвращает прежнее значение без обращения к серверу", async ({ page }) => {
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    const dialog = await openWindow(page);
    let actions = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"]) actions++;
    });

    const time = dialog.getByLabel("Время напоминания");
    await time.fill("");
    await time.blur();
    await expect(time).toHaveValue("14:00");
    expect(actions).toBe(0);
    expect((await mealReminders(me.login)).map((r) => r.minutes)).toEqual([840]);
  });

  test("подсказка про уведомления: без подписок есть, с push-подпиской или Telegram — нет", async ({ page }) => {
    const me = await reminderUser(page);
    let dialog = await openWindow(page);
    await expect(dialog.getByText("Чтобы напоминания приходили на телефон,")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "включите уведомления" })).toHaveAttribute("href", "/settings");

    await addSubscription(me.login, { endpoint: `https://push.example.test/${me.login}`, p256dh: "p", auth: "a" });
    dialog = await openWindow(page);
    await expect(dialog.getByText("Напоминаний пока нет")).toBeVisible();
    await expect(dialog.getByText("Чтобы напоминания приходили на телефон,")).toHaveCount(0);
  });

  test("подсказка про уведомления не показывается при привязанном Telegram", async ({ page }) => {
    const me = await reminderUser(page);
    await linkTelegram(me.login, String(Math.floor(9e12 + Math.random() * 1e12)));
    const dialog = await openWindow(page);
    await expect(dialog.getByText("Напоминаний пока нет")).toBeVisible();
    await expect(dialog.getByText("Чтобы напоминания приходили на телефон,")).toHaveCount(0);
  });

  test("напоминание, поставленное на уже наступившее время, сегодня не срабатывает", async ({ page, request }) => {
    const today = localDay();
    const nowMin = localMinutes(new Date(), E2E_TZ);
    test.skip(nowMin < 10, "В первые минуты суток «10 минут назад» — вчера");
    const past = nowMin - 10;
    const me = await reminderUser(page);
    const dialog = await openWindow(page);

    await addButton(dialog).click();
    const time = dialog.getByLabel("Время напоминания");
    await expect(time).toHaveValue("09:00");
    await time.fill(formatTime(past));
    await time.blur();
    await expect.poll(async () => (await mealReminders(me.login))[0].minutes).toBe(past);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);

    await tick(request, new Date());
    expect(await mealReminderNotifications(me.login)).toEqual([]);
  });
});
