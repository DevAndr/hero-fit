import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachTemplate, enableCoach, idOf, linkCoach, setTimeZone } from "./db";
import { pickOption, registerUser } from "./helpers";
import { E2E_TZ_OFFSET } from "./tz";

/** Ник ≤ 20 символов и уникален между прогонами: хвост логина с меткой времени. */
const nickOf = (login: string) => `Coac_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const localNow = () => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000);
const localDate = (n: number) => new Date(localNow().getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** Ближайший понедельник строго после сегодня. */
const nextMonday = () => localDate(((1 - localNow().getUTCDay() + 7) % 7) || 7);

async function client(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  await setTimeZone(user.login);
  return { context, page, ...user };
}

/** Тренер со своим шаблоном и тремя клиентами. */
async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login);
  await enableCoach(coach.login, nick);
  await setTimeZone(coach.login);
  await coachTemplate(coach.login, "Ноги — база");
  const clients = [await client(browser, "Аня"), await client(browser, "Боря"), await client(browser, "Вика")];
  for (const c of clients) await linkCoach(coach.login, c.login);
  return { nick, clients };
}

const fromCoach = (page: Page, nick: string) => page.getByText(`от тренера · ${nick}`).filter({ visible: true });

test("assign a series to two of three clients", async ({ page, browser }) => {
  test.slow();
  const { nick, clients } = await setup(page, browser);
  const [a, b, c] = clients;
  try {
    await page.goto("/coach");
    await page.getByRole("button", { name: "Назначить нескольким" }).click();
    const dialog = page.getByRole("dialog", { name: "Назначить нескольким" });
    await expect(dialog.getByRole("button", { name: "Назначить", exact: true })).toBeDisabled();

    const picked = dialog.getByRole("group", { name: "Клиенты" });
    await picked.getByRole("checkbox", { name: "Аня" }).click();
    await picked.getByRole("checkbox", { name: "Боря" }).click();
    await pickOption(page, dialog.getByLabel("Шаблон"), "Ноги — база");
    await dialog.getByLabel("Дата").fill(nextMonday());
    await dialog.getByRole("checkbox", { name: "Повторять каждую неделю" }).click();
    await dialog.getByRole("button", { name: "Ср" }).click();
    await dialog.getByRole("button", { name: "Назначить", exact: true }).click();
    await expect(page.getByText("Назначено 2 клиентам")).toBeVisible();
    await expect(dialog).toHaveCount(0);

    for (const who of [a, b]) {
      await who.page.goto(`/calendar?date=${nextMonday()}`);
      await expect(fromCoach(who.page, nick).first()).toBeVisible();
    }
    await c.page.goto(`/calendar?date=${nextMonday()}`);
    await expect(c.page.getByRole("heading", { name: "Календарь" })).toBeVisible();
    await expect(fromCoach(c.page, nick)).toHaveCount(0);

    // Уведомление — каждому назначенному
    for (const who of [a, b]) {
      await who.page.goto("/dashboard");
      await who.page.getByRole("button", { name: /Уведомления/ }).click();
      await expect(who.page.getByText("Новый план от тренера")).toBeVisible();
    }

    // Назначения независимы: правка у Ани не трогает Борю
    const upcoming = page.getByRole("region", { name: "Ближайшие 2 недели" });
    await page.goto(`/coach/clients/${await idOf(a.login)}?tab=plan`);
    await upcoming.getByRole("listitem").first().getByRole("button", { name: "Изменить" }).click();
    const edit = page.getByRole("dialog");
    await edit.getByLabel("Начало").fill("07:00");
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await edit.getByRole("button", { name: "Только эту" }).click();
    await expect(edit).toHaveCount(0);
    await expect(upcoming.getByRole("listitem").first()).toContainText("07:00");
    await page.goto(`/coach/clients/${await idOf(b.login)}?tab=plan`);
    await expect(upcoming.getByRole("listitem").first()).toContainText("19:00");
  } finally {
    for (const who of clients) await who.context.close();
  }
});

test("«Выбрать всех» checks every client", async ({ page, browser }) => {
  const { clients } = await setup(page, browser);
  try {
    await page.goto("/coach");
    await page.getByRole("button", { name: "Назначить нескольким" }).click();
    const picked = page.getByRole("dialog").getByRole("group", { name: "Клиенты" });
    // Часть отмечена — «Выбрать всех» не отмечен (не «частично»: его галочку легко принять за «все»)
    await picked.getByRole("checkbox", { name: "Аня" }).click();
    await expect(picked.getByRole("checkbox", { name: "Выбрать всех" })).toHaveAttribute("aria-checked", "false");
    await picked.getByRole("checkbox", { name: "Аня" }).click();
    await picked.getByRole("checkbox", { name: "Выбрать всех" }).click();
    for (const name of ["Аня", "Боря", "Вика"]) await expect(picked.getByRole("checkbox", { name })).toBeChecked();
    await picked.getByRole("checkbox", { name: "Выбрать всех" }).click();
    for (const name of ["Аня", "Боря", "Вика"]) await expect(picked.getByRole("checkbox", { name })).not.toBeChecked();
  } finally {
    for (const who of clients) await who.context.close();
  }
});
