import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, addFoodEntry, addMealReminder, deleteMealReminders, mealReminderNotifications, mealReminders, setTimeZone } from "./db";
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
  await setTimeZone(me.login);
  return me;
}

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
});
