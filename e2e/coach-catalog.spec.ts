import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, coachProfile, contactClicks, createUserRow, enableCoach } from "./db";
import { registerUser, uniqueLogin } from "./helpers";

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

/** Тренер только в БД (без входа): по умолчанию — полностью в каталоге. */
async function dbCoach(city: string, extra: Partial<Parameters<typeof coachProfile>[1]> = {}) {
  const login = uniqueLogin();
  await createUserRow(login);
  const nick = nickOf(login);
  await enableCoach(login, nick);
  await coachProfile(login, { about: ABOUT, publish: true, city, contacts: { telegram: tgOf(login) }, consent: true, listed: true, ...extra });
  return { login, nick };
}

/** Уникальный «город» на тест — каталог общий для параллельных тестов. */
const cityOf = () => `Город${uniqueLogin().replace(/[^a-z0-9]/g, "").slice(-10)}`;

async function viewer(page: Page) {
  const v = await registerUser(page);
  await addFlagUser("coach_catalog", v.login);
  return v;
}

const cards = (page: Page) => page.getByRole("list", { name: "Тренеры" }).getByRole("listitem").filter({ has: page.getByRole("link", { name: "Подробнее" }) });

test("catalog: a listed coach is shown; unlisted, no-consent and no-contact coaches are not", async ({ page }) => {
  const city = cityOf();
  const shown = await dbCoach(city, { displayName: "Видимый Тренер" });
  await dbCoach(city, { listed: false });
  await dbCoach(city, { consent: false });
  await dbCoach(city, { contacts: {} });
  await viewer(page);
  await page.goto(`/trainers?city=${encodeURIComponent(city.toUpperCase())}`);
  await expect(page.getByRole("heading", { level: 1, name: "Тренеры Hero Fit" })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Видимый Тренер");
  await expect(cards(page).first().getByRole("link", { name: `Telegram @${tgOf(shown.login)}` })).toBeVisible();
  await cards(page).first().getByRole("link", { name: "Подробнее" }).click();
  await expect(page).toHaveURL(new RegExp(`/trainer/${shown.nick}$`));
});

test("catalog: format filter — «online and in the gym» matches both; specialty filter", async ({ page }) => {
  const city = cityOf();
  await dbCoach(city, { displayName: "Онлайн Тренер", format: "ONLINE", specialties: ["strength"] });
  await dbCoach(city, { displayName: "Зальный Тренер", format: "OFFLINE", specialties: ["mass"] });
  await dbCoach(city, { displayName: "Универсальный Тренер", format: "BOTH", specialties: ["strength"] });
  await viewer(page);
  const names = async (query: string) => {
    await page.goto(`/trainers?city=${encodeURIComponent(city)}&${query}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    return (await cards(page).getByRole("heading").allTextContents()).sort();
  };
  expect(await names("format=ONLINE")).toEqual(["Онлайн Тренер", "Универсальный Тренер"]);
  expect(await names("format=OFFLINE")).toEqual(["Зальный Тренер", "Универсальный Тренер"]);
  expect(await names("specialty=mass")).toEqual(["Зальный Тренер"]);
  expect(await names("format=OFFLINE&specialty=strength")).toEqual(["Универсальный Тренер"]);
});

test("catalog: filters form submits city, format and specialty", async ({ page }) => {
  const city = cityOf();
  await dbCoach(city, { displayName: "Тренер Формы", format: "ONLINE", specialties: ["rehab"] });
  await viewer(page);
  await page.goto("/trainers");
  await page.getByLabel("Город").selectOption({ label: city });
  await page.getByLabel("Формат").selectOption({ label: "онлайн" });
  await page.getByLabel("Специализация").selectOption({ label: "Восстановление после травм" });
  await page.getByRole("button", { name: "Показать" }).click();
  await expect(page).toHaveURL(/format=ONLINE/);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Тренер Формы");
});

test("catalog: empty state with reset", async ({ page }) => {
  await viewer(page);
  await page.goto("/trainers?city=nowhere-city-x");
  await expect(page.getByText("По этим условиям тренеров пока нет")).toBeVisible();
  await page.getByRole("link", { name: "Сбросить фильтры" }).click();
  await expect(page).toHaveURL(/\/trainers$/);
});

test("catalog: 404 without the flag", async ({ page }) => {
  await registerUser(page);
  const res = await page.goto("/trainers");
  expect(res?.status()).toBe(404);
});
