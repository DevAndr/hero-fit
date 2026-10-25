import { expect, test, type Page } from "@playwright/test";
import {
  cancelAssignment,
  coachAssignOnce,
  coachGroup,
  coachTemplate,
  completeAssignment,
  createUserRow,
  enableCoach,
  idOf,
  linkCoach,
  setNickname,
  setTimeZone,
  setUserTimeZone,
  withDb,
} from "./db";
import { registerUser, uniqueLogin } from "./helpers";
import { E2E_TZ_OFFSET, localAt } from "./tz";

// Календарь тренера (спека 2026-10-25-coach-calendar): данные готовятся в БД, у каждого теста свой тренер — параллельно.
const short = (login: string) => login.replace(/^e2e_/, "").replace(/[^a-z0-9]/g, "").slice(-12);
const DAY = 86_400_000;
const today = () => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000).toISOString().slice(0, 10);
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const mondayOf = (date: string) => plus(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

async function coach(page: Page) {
  const c = await registerUser(page, "Тренер");
  await enableCoach(c.login, `C_${short(c.login)}`);
  await setTimeZone(c.login);
  const tpl = await coachTemplate(c.login, "Ноги — база");
  return { ...c, tpl };
}

/** Клиент только в БД, с ником и связью с тренером. */
async function client(coachLogin: string, name: string) {
  const login = uniqueLogin();
  await createUserRow(login);
  const nickname = `${name}_${short(login).slice(-6)}`;
  await setNickname(login, nickname);
  await linkCoach(coachLogin, login);
  return { login, nickname };
}

const day = (page: Page, date: string) => page.getByRole("region", { name: dayLabel(date) });

test("two clients appear on their days with name and time", async ({ page }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  const borya = await client(c.login, "Боря");
  const monday = mondayOf(today());
  await coachAssignOnce(c.login, masha.login, c.tpl, "Ноги — база", plus(monday, 1), "19:00");
  await coachAssignOnce(c.login, borya.login, c.tpl, "Спина", plus(monday, 3), "08:30");

  await page.goto(`/coach/calendar?date=${monday}`);
  await expect(page.getByRole("heading", { level: 1, name: "Календарь клиентов" })).toBeVisible();
  await expect(day(page, plus(monday, 1)).getByRole("link", { name: new RegExp(`19:00 ${masha.nickname} · Ноги — база`) })).toBeVisible();
  await expect(day(page, plus(monday, 3)).getByRole("link", { name: new RegExp(`08:30 ${borya.nickname} · Спина`) })).toBeVisible();
  await expect(page.getByText("2 тренировки у 2 клиентов")).toBeVisible();
});

test("statuses: done, skipped, missed; summary counts the past", async ({ page }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  const monday = plus(mondayOf(today()), -7);
  const done = await coachAssignOnce(c.login, masha.login, c.tpl, "Сделала", monday, "10:00");
  const skipped = await coachAssignOnce(c.login, masha.login, c.tpl, "Отменила", plus(monday, 1), "10:00");
  await coachAssignOnce(c.login, masha.login, c.tpl, "Забыла", plus(monday, 2), "10:00");
  await completeAssignment(masha.login, done, localAt(monday, "11:00"));
  await cancelAssignment(skipped);

  await page.goto(`/coach/calendar?date=${monday}`);
  await expect(day(page, monday).getByRole("link", { name: /Сделала/ })).toContainText("выполнено");
  await expect(day(page, plus(monday, 1)).getByRole("link", { name: /Отменила/ })).toContainText("пропущено");
  await expect(day(page, plus(monday, 2)).getByRole("link", { name: /Забыла/ })).toContainText("не выполнено");
  await expect(page.getByText("выполнено 1 из 3 прошедших")).toBeVisible();
});

test("group filter keeps one client; a foreign group shows all", async ({ page, browser }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  const borya = await client(c.login, "Боря");
  const date = today();
  await coachAssignOnce(c.login, masha.login, c.tpl, "Ноги — база", date, "19:00");
  await coachAssignOnce(c.login, borya.login, c.tpl, "Ноги — база", date, "20:00");
  await coachGroup(c.login, "Утро", [masha.login]);

  const ctx = await browser.newContext();
  const other = await registerUser(await ctx.newPage(), "Другой");
  await ctx.close();
  const foreign = await coachGroup(other.login, "Чужая", []);

  await page.goto("/coach/calendar");
  await page.getByRole("link", { name: "Утро" }).click();
  await expect(page).toHaveURL(/group=/);
  await expect(page.getByRole("link", { name: new RegExp(masha.nickname) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(borya.nickname) })).toHaveCount(0);

  const empty = await coachGroup(c.login, "Пустая", []);
  await page.goto(`/coach/calendar?group=${empty}`);
  await expect(page.getByText("В этой группе нет клиентов")).toBeVisible();

  await page.goto(`/coach/calendar?group=${foreign}`);
  await expect(page.getByRole("link", { name: new RegExp(masha.nickname) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(borya.nickname) })).toBeVisible();
});

test("a row opens the client's plan", async ({ page }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  await coachAssignOnce(c.login, masha.login, c.tpl, "Ноги — база", today(), "19:00");
  await page.goto("/coach/calendar");
  await page.getByRole("link", { name: new RegExp(masha.nickname) }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/clients/${await idOf(masha.login)}\\?tab=plan$`));
});

test("month: four on one day — three rows and «ещё 1»", async ({ page }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  const date = today();
  for (const time of ["08:00", "10:00", "12:00", "14:00"]) await coachAssignOnce(c.login, masha.login, c.tpl, `В ${time}`, date, time);
  await page.goto(`/coach/calendar?view=month&date=${date}`);
  const cell = day(page, date);
  await expect(cell.getByRole("link", { name: /В \d\d:00/ })).toHaveCount(3);
  await cell.getByText("ещё 1").click();
  await expect(cell.getByRole("link", { name: /В \d\d:00/ })).toHaveCount(4);
});

test("another coach's client and a former client are not shown", async ({ page, browser }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  const former = await client(c.login, "Бывший");
  await coachAssignOnce(c.login, masha.login, c.tpl, "Ноги — база", today(), "19:00");
  await coachAssignOnce(c.login, former.login, c.tpl, "Ноги — база", today(), "19:30");
  // Разрыв только этой связи; назначения остаются в БД — их отсекает фильтр активной связи
  await withDb((db) =>
    db.query(`update "CoachLink" set "endedAt" = now() where "clientId" = (select id from "User" where login = $1)`, [former.login]),
  );

  const ctx = await browser.newContext();
  const otherPage = await ctx.newPage();
  const other = await coach(otherPage);
  const stranger = await client(other.login, "Чужой");
  await coachAssignOnce(other.login, stranger.login, other.tpl, "Ноги — база", today(), "18:00");
  await ctx.close();

  await page.goto("/coach/calendar");
  await expect(page.getByRole("link", { name: new RegExp(masha.nickname) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(former.nickname) })).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(stranger.nickname) })).toHaveCount(0);
});

test("client in another timezone: today's assignment is upcoming and marked «время клиента»", async ({ page }) => {
  const c = await coach(page);
  const far = await client(c.login, "Далеко");
  const offset = E2E_TZ_OFFSET + 12 <= 14 ? E2E_TZ_OFFSET + 12 : E2E_TZ_OFFSET - 12;
  await setUserTimeZone(far.login, offset === 0 ? "UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`);
  const theirToday = new Date(Date.now() + offset * 3600_000).toISOString().slice(0, 10);
  await coachAssignOnce(c.login, far.login, c.tpl, "Ноги — база", theirToday, "23:30");

  await page.goto(`/coach/calendar?date=${theirToday}`);
  const row = day(page, theirToday).getByRole("link", { name: new RegExp(far.nickname) });
  await expect(row).toContainText("время клиента");
  await expect(row).not.toContainText("не выполнено");
});

test("bad date falls back to today; not a coach — 404; /coach links to «Календарь клиентов»", async ({ page, browser }) => {
  await coach(page);
  await page.goto("/coach/calendar?date=2026-13-45");
  await expect(day(page, today())).toBeVisible();
  await expect(page.getByText("Пока нет клиентов")).toBeVisible();

  await page.goto("/coach");
  await page.getByRole("main").getByRole("link", { name: "Календарь клиентов" }).click();
  await expect(page).toHaveURL(/\/coach\/calendar$/);

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await registerUser(p);
  expect((await p.goto("/coach/calendar"))?.status()).toBe(404);
  await ctx.close();
});

test("empty range: «На эти дни ничего не назначено»", async ({ page }) => {
  const c = await coach(page);
  await client(c.login, "Маша");
  await page.goto("/coach/calendar");
  await expect(page.getByText("На эти дни ничего не назначено")).toBeVisible();
});

test("mobile width: no horizontal scroll", async ({ page }) => {
  const c = await coach(page);
  const masha = await client(c.login, "Маша");
  await coachAssignOnce(c.login, masha.login, c.tpl, "Очень длинное название тренировки на ноги", today(), "19:00");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const view of ["week", "month"]) {
    await page.goto(`/coach/calendar?view=${view}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  }
});
