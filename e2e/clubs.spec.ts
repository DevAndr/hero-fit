import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, createClub } from "./db";
import { registerUser } from "./helpers";

// Флаг clubs — списком на пользователя (addFlagUser): спеки идут параллельно. Модерация — e2e/clubs-moderation.spec.ts

const unique = () => Math.random().toString(36).slice(2, 7);

async function clubsUser(page: Page) {
  const me = await registerUser(page);
  await addFlagUser("clubs", me.login);
  return me;
}

test("no flag — no clubs", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Клуб", exact: true })).toHaveCount(0);
  const res = await page.goto("/clubs");
  expect(res?.status()).toBe(404);
});

test("search finds approved clubs only, literally", async ({ page }) => {
  const me = await clubsUser(page);
  const city = `Тестоград${unique()}`;
  await createClub(me.login, { city, name: "Сила 100%", address: "ул. Мира, 7" });
  await createClub(me.login, { city, name: "Сила скрытая", status: "HIDDEN" });
  await createClub(me.login, { city, name: "Сила 1000", address: "ул. Мира, 9" });

  await page.goto("/clubs");
  const search = page.getByRole("search", { name: "Поиск клуба" });
  await search.getByLabel("Город").fill(city);
  await search.getByRole("button", { name: "Найти" }).click();
  const results = page.getByRole("list", { name: "Клубы" });
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(results.getByText("Сила скрытая")).toHaveCount(0);

  await search.getByLabel("Название или адрес").fill("100%");
  await search.getByRole("button", { name: "Найти" }).click();
  await expect(results.getByRole("listitem")).toHaveCount(2); // «100» — и «Сила 100%», и «Сила 1000»

  await search.getByLabel("Город").fill(`Нетакого${unique()}`);
  await search.getByLabel("Название или адрес").fill("%");
  await search.getByRole("button", { name: "Найти" }).click();
  await expect(page.getByText("Ничего не нашлось")).toBeVisible();
});

test("application: consent checkbox, my clubs, pending limit, rejected reason", async ({ page }) => {
  const me = await clubsUser(page);
  await createClub(me.login, { status: "REJECTED", name: `Отклонённый ${unique()}`, rejectReason: "Нет такого зала" });
  const city = `Заявкоград${unique()}`;

  await page.goto("/clubs");
  await page.getByRole("link", { name: "Создать клуб" }).click();
  await expect(page).toHaveURL(/\/clubs\/new$/);
  const form = page.getByRole("form", { name: "Заявка на клуб" });
  await form.getByLabel("Название").fill("Железо");
  await form.getByLabel("Город").fill(city);
  await form.getByLabel("Адрес").fill("ул. Спортивная, 3");
  await form.getByLabel("Контакт зала").fill("+7 900 111-22-33");
  await form.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(form.getByText("Подтвердите, что представляете этот зал")).toBeVisible();

  await form.getByRole("checkbox", { name: "Я представляю этот зал" }).click();
  await form.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByText("Заявка отправлена")).toBeVisible();

  await page.goto("/clubs");
  const mine = page.getByRole("region", { name: "Мои клубы" });
  await expect(mine.getByText("Железо")).toBeVisible();
  await expect(mine.getByText("На проверке")).toBeVisible();
  await expect(mine.getByText("Отклонена: Нет такого зала")).toBeVisible();

  // Похожий клуб — подсказка в форме
  await page.goto("/clubs/new");
  await form.getByLabel("Город").fill(city);
  await form.getByLabel("Название").fill("Железо");
  await expect(form.getByText("Возможно, ваш зал уже есть")).toBeVisible();

  // Лимит заявок на проверке
  await createClub(me.login, { status: "PENDING" });
  await createClub(me.login, { status: "PENDING" });
  await form.getByLabel("Адрес").fill("ул. Спортивная, 4");
  await form.getByLabel("Контакт зала").fill("+7 900 111-22-33");
  await form.getByRole("checkbox", { name: "Я представляю этот зал" }).click();
  await form.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(form.getByText("Не больше 3 заявок на проверке")).toBeVisible();
});

test("menu item with the flag", async ({ page }) => {
  await clubsUser(page);
  await page.goto("/dashboard");
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.getByRole("navigation").getByRole("link", { name: "Клуб", exact: true }).click();
  } else {
    await page.getByRole("button", { name: /Меню профиля/ }).click();
    await page.getByRole("menuitem", { name: "Клуб", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/clubs$/);
});
