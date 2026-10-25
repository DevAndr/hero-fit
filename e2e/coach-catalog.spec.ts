import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, coachProfile, contactClicks, enableCoach } from "./db";
import { registerUser } from "./helpers";

// Каталог тренеров (спека 2026-10-25-coach-catalog): флаг coach_catalog — на смотрящего, поэтому параллельно.
// Гость и глобальный флаг — coach-catalog-global.spec.ts. Экран не важен — только desktop.
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Логика каталога от ширины экрана не зависит");
});

const nickOf = (login: string) => `T_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const tgOf = (login: string) => `tg_${login.replace(/^e2e_/, "").replace(/[^A-Za-z0-9]/g, "").slice(-20)}`;
const ABOUT = "Работаю с новичками и силовыми: базовые движения, техника, понятный прогресс каждую неделю.";

/** Тренер с опубликованной страницей и флагом каталога. */
async function coachWithPage(page: Page, extra: Partial<Parameters<typeof coachProfile>[1]> = {}) {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login);
  await enableCoach(coach.login, nick);
  await coachProfile(coach.login, { about: ABOUT, publish: true, city: "Казань", ...extra });
  await addFlagUser("coach_catalog", coach.login);
  return { coach, nick, tg: tgOf(coach.login) };
}

const catalogSection = (page: Page) => page.getByRole("region", { name: "Каталог тренеров" });
const contactsSection = (page: Page) => page.getByRole("region", { name: "Контакты" });

test("editor: contacts are saved normalized; the catalog switch is off by default with a hint", async ({ page }) => {
  const { tg } = await coachWithPage(page);
  await page.goto("/coach/page");
  await contactsSection(page).getByLabel("Телефон").fill("8 (999) 123-45-67");
  await contactsSection(page).getByLabel("Telegram").fill(`@${tg}`);
  await contactsSection(page).getByRole("checkbox", { name: "Показывать контакты вошедшим пользователям Hero Fit" }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено")).toBeVisible();

  await page.reload();
  await expect(contactsSection(page).getByLabel("Телефон")).toHaveValue("+79991234567");
  await expect(contactsSection(page).getByLabel("Telegram")).toHaveValue(tg);
  await expect(catalogSection(page).getByRole("switch", { name: "Показывать меня в каталоге тренеров" })).not.toBeChecked();
  await expect(catalogSection(page)).toContainText("Не в каталоге: включите показ в каталоге");
});

test("editor: bad phone is refused with a message", async ({ page }) => {
  await coachWithPage(page);
  await page.goto("/coach/page");
  await contactsSection(page).getByLabel("Телефон").fill("12345");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Проверьте номер")).toBeVisible();
});

test("editor: switch on → in the catalog; consent off → out, values kept", async ({ page }) => {
  const { tg } = await coachWithPage(page, { contacts: { telegram: tgOf("x") }, consent: true });
  await page.goto("/coach/page");
  await contactsSection(page).getByLabel("Telegram").fill(tg);
  await catalogSection(page).getByRole("switch", { name: "Показывать меня в каталоге тренеров" }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(catalogSection(page)).toContainText("В каталоге тренеров");
  await expect(catalogSection(page).getByRole("link", { name: "Открыть каталог" })).toHaveAttribute("href", "/trainers");

  await contactsSection(page).getByRole("checkbox", { name: "Показывать контакты вошедшим пользователям Hero Fit" }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(catalogSection(page)).toContainText("Не в каталоге: отметьте согласие на показ контактов");
  await page.reload();
  await expect(contactsSection(page).getByLabel("Telegram")).toHaveValue(tg);
});

test("editor: without the flag there is no catalog section, contacts are still editable", async ({ page }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login));
  await coachProfile(coach.login, { about: ABOUT, publish: true });
  await page.goto("/coach/page");
  await expect(contactsSection(page).getByLabel("Telegram")).toBeVisible();
  await expect(catalogSection(page)).toHaveCount(0);
});

test("trainer page: a signed-in user sees contact links; a click is counted for the coach", async ({ page, browser }) => {
  const { coach, nick, tg } = await coachWithPage(page);
  await coachProfile(coach.login, { about: ABOUT, publish: true, city: "Казань", contacts: { telegram: tgOf(coach.login), phone: "+79991234567" }, consent: true });

  const ctx = await browser.newContext();
  try {
    const viewer = await ctx.newPage();
    const v = await registerUser(viewer);
    await addFlagUser("coach_catalog", v.login);
    await ctx.route("https://t.me/**", (r) => r.fulfill({ body: "" }));
    await viewer.goto(`/trainer/${nick}`);
    const contacts = viewer.getByRole("region", { name: "Контакты" });
    await expect(contacts.getByRole("link", { name: "Телефон +7 999 123-45-67" })).toHaveAttribute("href", "tel:+79991234567");
    const telegram = contacts.getByRole("link", { name: `Telegram @${tg}` });
    await expect(telegram).toHaveAttribute("href", `https://t.me/${tg}`);
    await Promise.all([ctx.waitForEvent("page"), telegram.click()]);
    await expect.poll(() => contactClicks(coach.login)).toBe(1);
  } finally {
    await ctx.close();
  }

  await page.goto("/coach/page");
  await expect(catalogSection(page)).toContainText("Контакты открывали 1 раз за 30 дней");
});

test("trainer page: the coach's own clicks are not counted", async ({ page }) => {
  const { coach, nick, tg } = await coachWithPage(page, { contacts: { telegram: tgOf("own") }, consent: true });
  await coachProfile(coach.login, { about: ABOUT, publish: true, city: "Казань", contacts: { telegram: tg }, consent: true });
  await page.context().route("https://t.me/**", (r) => r.fulfill({ body: "" }));
  await page.goto(`/trainer/${nick}`);
  await Promise.all([page.context().waitForEvent("page"), page.getByRole("region", { name: "Контакты" }).getByRole("link", { name: `Telegram @${tg}` }).click()]);
  await page.goto("/coach/page");
  await expect(catalogSection(page)).toContainText("Контакты открывали 0 раз за 30 дней");
  expect(await contactClicks(coach.login)).toBe(0);
});

test("trainer page: no consent — no contacts block", async ({ page, browser }) => {
  const { coach, nick } = await coachWithPage(page);
  await coachProfile(coach.login, { about: ABOUT, publish: true, city: "Казань", contacts: { phone: "+79991234567" }, consent: false });
  const ctx = await browser.newContext();
  try {
    const viewer = await ctx.newPage();
    const v = await registerUser(viewer);
    await addFlagUser("coach_catalog", v.login);
    await viewer.goto(`/trainer/${nick}`);
    await expect(viewer.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(viewer.getByRole("region", { name: "Контакты" })).toHaveCount(0);
    expect(await viewer.content()).not.toContain("79991234567");
  } finally {
    await ctx.close();
  }
});

test("trainer page: without the viewer's flag — no contacts block", async ({ page, browser }) => {
  const { coach, nick } = await coachWithPage(page);
  await coachProfile(coach.login, { about: ABOUT, publish: true, city: "Казань", contacts: { phone: "+79991234567" }, consent: true });
  const ctx = await browser.newContext();
  try {
    const viewer = await ctx.newPage();
    await registerUser(viewer);
    await viewer.goto(`/trainer/${nick}`);
    await expect(viewer.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await viewer.content()).not.toContain("79991234567");
  } finally {
    await ctx.close();
  }
});
