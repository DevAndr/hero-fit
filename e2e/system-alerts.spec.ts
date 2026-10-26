import { expect, test, type Page } from "@playwright/test";
import { alertDismissalCount, clearAlerts, createAlert, enableCoach, makeAdmin, resetOnboarding, withDb } from "./db";
import { registerUser } from "./helpers";

// Системные оповещения (спека 2026-10-18-system-alerts-design). Живое оповещение видят все —
// отдельный проект alerts-global после остальных, внутри по очереди.
test.describe.configure({ mode: "serial" });
test.beforeEach(clearAlerts);
test.afterAll(clearAlerts);

const banner = (page: Page, text: string) => page.getByRole("region", { name: "Оповещение" }).filter({ hasText: text });

test.describe("in the app", () => {
  test("banner dismissed forever stays hidden after reload", async ({ page }) => {
    await registerUser(page);
    const id = await createAlert({ kind: "BANNER", body: "Техработы в 23:00", tone: "WARNING" });
    await page.goto("/exercises");
    await expect(banner(page, "Техработы в 23:00")).toBeVisible();
    await banner(page, "Техработы в 23:00").getByRole("button", { name: "Закрыть оповещение" }).click();
    await expect(banner(page, "Техработы в 23:00")).toBeHidden();
    await expect.poll(() => alertDismissalCount(id)).toBe(1);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(page, "Техработы в 23:00")).toBeHidden();
  });

  test("session dismissal: hidden in this tab, shown again in a new one", async ({ page, context }) => {
    await registerUser(page);
    const id = await createAlert({ kind: "BANNER", body: "Сессионное", dismiss: "SESSION" });
    await page.goto("/exercises");
    await banner(page, "Сессионное").getByRole("button", { name: "Закрыть оповещение" }).click();
    await expect(banner(page, "Сессионное")).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(page, "Сессионное")).toBeHidden();
    const tab = await context.newPage();
    await tab.goto("/exercises");
    await expect(banner(tab, "Сессионное")).toBeVisible();
    expect(await alertDismissalCount(id)).toBe(0);
  });

  test("audience: coaches see «coaches» alerts, regular users see «users» alerts, everyone sees «all»", async ({ page, browser }) => {
    await createAlert({ kind: "BANNER", body: "Тренерам: новый календарь", audience: "COACHES" });
    await createAlert({ kind: "BANNER", body: "Пользователям: каталог тренеров", audience: "USERS" });
    await createAlert({ kind: "BANNER", body: "Всем: техработы" });

    await registerUser(page);
    await page.goto("/exercises");
    await expect(banner(page, "Всем: техработы")).toBeVisible();
    await expect(banner(page, "Пользователям: каталог тренеров")).toBeVisible();
    await expect(banner(page, "Тренерам: новый календарь")).toBeHidden();

    const coachPage = await browser.newPage();
    const coach = await registerUser(coachPage);
    await enableCoach(coach.login, `A_${coach.login.replace(/[^a-z0-9]/g, "").slice(-15)}`);
    await coachPage.goto("/exercises");
    await expect(banner(coachPage, "Всем: техработы")).toBeVisible();
    await expect(banner(coachPage, "Тренерам: новый календарь")).toBeVisible();
    await expect(banner(coachPage, "Пользователям: каталог тренеров")).toBeHidden();
    await coachPage.close();
  });

  test("non-dismissable banner has no close button", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "BANNER", body: "Нельзя закрыть", dismiss: "NEVER", tone: "CRITICAL" });
    await page.goto("/exercises");
    await expect(banner(page, "Нельзя закрыть")).toBeVisible();
    await expect(banner(page, "Нельзя закрыть").getByRole("button", { name: "Закрыть оповещение" })).toHaveCount(0);
  });

  test("planned and disabled alerts are not shown", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "BANNER", body: "Завтрашнее", startsInMs: 60 * 60_000 });
    await createAlert({ kind: "BANNER", body: "Выключенное", enabled: false });
    await createAlert({ kind: "BANNER", body: "Контроль" });
    await page.goto("/exercises");
    await expect(banner(page, "Контроль")).toBeVisible();
    await expect(banner(page, "Завтрашнее")).toBeHidden();
    await expect(banner(page, "Выключенное")).toBeHidden();
  });

  test("banner goes away when its end comes, without reload", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "BANNER", body: "Скоро уйдёт", endsInMs: 8_000 });
    await page.goto("/exercises");
    await expect(banner(page, "Скоро уйдёт")).toBeVisible();
    await expect(banner(page, "Скоро уйдёт")).toBeHidden({ timeout: 15_000 });
  });

  test("popups come one at a time, critical first", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "POPUP", title: "Обычный", body: "Второй попап" });
    await createAlert({ kind: "POPUP", title: "Срочно", body: "Первый попап", tone: "CRITICAL" });
    await page.goto("/exercises");
    const first = page.getByRole("dialog", { name: "Срочно" });
    await expect(first).toBeVisible();
    await expect(first).toContainText("Первый попап");
    await first.getByRole("button", { name: "Понятно" }).click();
    const second = page.getByRole("dialog", { name: "Обычный" });
    await expect(second).toBeVisible();
    await second.getByRole("button", { name: "Понятно" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("long banner text expands on click with reduced motion", async ({ page }) => {
    await registerUser(page);
    const long = `Длинное оповещение ${"очень длинный текст ".repeat(20)}конец`;
    await createAlert({ kind: "BANNER", body: long });
    await page.goto("/exercises");
    const toggle = banner(page, "Длинное оповещение").getByRole("button", { name: /Длинное оповещение/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("banner button follows the link and dismisses", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "BANNER", body: "Вышел релиз", ctaLabel: "Подробнее", ctaHref: "/whats-new" });
    await page.goto("/exercises");
    await banner(page, "Вышел релиз").getByRole("link", { name: "Подробнее" }).click();
    await expect(page).toHaveURL(/\/whats-new$/);
    await expect(banner(page, "Вышел релиз")).toBeHidden();
  });
});

test.describe("edge cases", () => {
  test("popup waits while the onboarding tour is open", async ({ page }) => {
    const me = await registerUser(page);
    await createAlert({ kind: "POPUP", title: "Анонс", body: "Попап поверх экскурсии" });
    await resetOnboarding(me.login);
    await page.goto("/dashboard");
    await expect(page.getByRole("dialog", { name: "Добро пожаловать в Hero Fit" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Анонс" })).toHaveCount(0);
    await page.goto("/exercises");
    await expect(page.getByRole("dialog", { name: "Анонс" })).toBeVisible();
  });

  test("banner respects the Telegram safe area", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "BANNER", body: "Под шторкой Telegram" });
    await page.goto("/exercises");
    await page.addStyleTag({ content: ":root { --tg-safe-top: 40px !important; }" });
    const box = await banner(page, "Под шторкой Telegram").boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(40);
  });

  test("dismissing an alert deleted meanwhile does not fail", async ({ page }) => {
    await registerUser(page);
    await createAlert({ kind: "BANNER", body: "Уже удалено" });
    await page.goto("/exercises");
    await expect(banner(page, "Уже удалено")).toBeVisible();
    await clearAlerts();
    const action = page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined);
    await banner(page, "Уже удалено").getByRole("button", { name: "Закрыть оповещение" }).click();
    expect((await action).status()).toBe(200);
    await expect(banner(page, "Уже удалено")).toBeHidden();
  });

  test("disabled popup is gone after reload", async ({ page }) => {
    await registerUser(page);
    const id = await createAlert({ kind: "POPUP", title: "Выключат", body: "Сейчас выключат" });
    await page.goto("/exercises");
    await expect(page.getByRole("dialog", { name: "Выключат" })).toBeVisible();
    await withDb((db) => db.query(`update "SystemAlert" set enabled = false where id = $1`, [id]));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Выключат" })).toHaveCount(0);
  });
});

test.describe("admin page", () => {
  test("non-admin gets 404", async ({ page }) => {
    await registerUser(page);
    const res = await page.goto("/admin/alerts");
    expect(res?.status()).toBe(404);
  });

  test("admin schedules a banner, a user dismisses it, admin sees the count and disables it", async ({ page, browser }) => {
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin/alerts");
    await page.getByRole("button", { name: "Новое оповещение" }).click();
    const form = page.getByRole("dialog", { name: "Новое оповещение" });
    await form.getByLabel("Текст").fill("Техработы в 23:00");
    await form.getByRole("radio", { name: "Важно" }).click();
    await form.getByRole("radio", { name: "Можно закрыть навсегда" }).click();
    await expect(form.getByRole("radio", { name: "Всем" })).toBeChecked();
    await expect(form.getByRole("region", { name: "Превью" })).toContainText("Техработы в 23:00");
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(form).toBeHidden();
    const live = page.getByRole("region", { name: "Идут сейчас" });
    await expect(live.getByRole("article", { name: "Техработы в 23:00" })).toBeVisible();
    await page.reload();
    await expect(banner(page, "Техработы в 23:00")).toBeVisible();

    const other = await browser.newPage();
    await registerUser(other);
    await other.goto("/exercises");
    await banner(other, "Техработы в 23:00").getByRole("button", { name: "Закрыть оповещение" }).click();
    await expect(banner(other, "Техработы в 23:00")).toBeHidden();

    const third = await browser.newPage();
    await registerUser(third);
    await third.goto("/exercises");
    await expect(banner(third, "Техработы в 23:00")).toBeVisible();

    await expect(async () => {
      await page.reload();
      await expect(live.getByRole("article", { name: "Техработы в 23:00" })).toContainText("Закрыли: 1", { timeout: 1000 });
    }).toPass();
    await live.getByRole("article", { name: "Техработы в 23:00" }).getByRole("switch", { name: "Включено" }).click();
    await expect(page.getByRole("region", { name: "Прошедшие и выключенные" }).getByRole("article", { name: "Техработы в 23:00" })).toBeVisible();
    await third.reload();
    await expect(third.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(third, "Техработы в 23:00")).toBeHidden();
  });

  test("admin sends to coaches only: the list marks it, a regular user does not see it", async ({ page, browser }) => {
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin/alerts");
    await page.getByRole("button", { name: "Новое оповещение" }).click();
    const form = page.getByRole("dialog", { name: "Новое оповещение" });
    await form.getByLabel("Текст").fill("Только тренерам");
    await form.getByRole("radio", { name: "Тренерам" }).click();
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(form).toBeHidden();
    const item = page.getByRole("region", { name: "Идут сейчас" }).getByRole("article", { name: "Только тренерам" });
    await expect(item).toContainText("тренерам");

    const user = await browser.newPage();
    await registerUser(user);
    await user.goto("/exercises");
    await expect(user.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(user, "Только тренерам")).toBeHidden();
    await user.close();
  });

  test("popup form: no «cannot close» option, title required; delete removes the alert", async ({ page }) => {
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin/alerts");
    await page.getByRole("button", { name: "Новое оповещение" }).click();
    const form = page.getByRole("dialog", { name: "Новое оповещение" });
    await expect(form.getByRole("radio", { name: "Нельзя закрыть" })).toBeVisible();
    await form.getByRole("radio", { name: "Попап" }).click();
    await expect(form.getByRole("radio", { name: "Нельзя закрыть" })).toHaveCount(0);
    await form.getByLabel("Текст").fill("Без заголовка");
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(form.getByRole("alert")).toHaveText("Заголовок обязателен для попапа");
    await form.getByLabel("Заголовок").fill("Анонс");
    // Начало — через час: попап не перекроет страницу админа
    await form.getByLabel("Начало показа").fill(await page.evaluate(() => {
      const d = new Date(Date.now() + 3600_000);
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }));
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(form).toBeHidden();
    const planned = page.getByRole("region", { name: "Запланированы" });
    const item = planned.getByRole("article", { name: "Анонс" });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("alertdialog", { name: "Удалить оповещение?" }).getByRole("button", { name: "Удалить" }).click();
    await expect(item).toBeHidden();
    await expect(planned).toContainText("Нет");
  });
});

