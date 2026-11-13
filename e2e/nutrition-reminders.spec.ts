import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, addFoodEntry, addMealReminder, mealReminderNotifications, mealReminders, setTimeZone } from "./db";
import { registerUser, runTick } from "./helpers";
import { E2E_TZ, localAt } from "./tz";

const localDay = (plusDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + plusDays * 86_400_000),
  );

const tick = (request: Parameters<typeof runTick>[0], at: Date) => runTick(request, at, "meals");

async function reminderUser(page: Page, withFlag = true) {
  const me = await registerUser(page);
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

  test("в 14:00 приходит напоминание об обеде, один раз за день", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });

    await tick(request, localAt(today, "14:00"));
    expect(await mealReminderNotifications(me.login)).toEqual([{ title: "Обед · 14:00", body: "Запишите обед в дневник" }]);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(page.getByText("Запишите обед в дневник")).toBeVisible();

    await tick(request, localAt(today, "14:05"));
    expect(await mealReminderNotifications(me.login)).toHaveLength(1);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);
  });

  test("обед уже записан — уведомления нет, день решён", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    await addFoodEntry(me.login, { date: today, meal: "LUNCH", name: "Суп", kcal: 300 });

    await tick(request, localAt(today, "14:00"));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(today);
  });

  test("записан только завтрак — про обед напоминает", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    await addFoodEntry(me.login, { date: today, meal: "BREAKFAST", name: "Овсянка", kcal: 300 });

    await tick(request, localAt(today, "14:00"));
    expect(await mealReminderNotifications(me.login)).toHaveLength(1);
  });

  test("до времени и после окна в час — не напоминает, день не ставится", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });

    await tick(request, localAt(today, "13:59"));
    await tick(request, localAt(today, "15:00"));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBeNull();
  });

  test("выключенное напоминание не приходит", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840, enabled: false });

    await tick(request, localAt(today, "14:00"));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
  });

  test("без флага nutrition не приходит и день не ставится", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page, false);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });

    await tick(request, localAt(today, "14:00"));
    expect(await mealReminderNotifications(me.login)).toEqual([]);
    expect((await mealReminders(me.login))[0].remindedDay).toBeNull();
  });

  test("00:30 и тик в 00:40 следующих местных суток — приходит, день — завтрашний", async ({ page, request }) => {
    const tomorrow = localDay(1);
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "SNACK", minutes: 30 });

    await tick(request, localAt(tomorrow, "00:40"));
    expect(await mealReminderNotifications(me.login)).toHaveLength(1);
    expect((await mealReminders(me.login))[0].remindedDay).toBe(tomorrow);
  });

  test("два напоминания одного пользователя — два уведомления", async ({ page, request }) => {
    const today = localDay();
    const me = await reminderUser(page);
    await addMealReminder(me.login, { meal: "LUNCH", minutes: 840 });
    await addMealReminder(me.login, { meal: "SNACK", minutes: 870 });

    await tick(request, localAt(today, "14:40"));
    // Оба в одном тике — порядок создания не гарантирован
    const sent = await mealReminderNotifications(me.login);
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining([
        { title: "Обед · 14:00", body: "Запишите обед в дневник" },
        { title: "Перекус · 14:30", body: "Запишите перекус в дневник" },
      ]),
    );
  });
});
