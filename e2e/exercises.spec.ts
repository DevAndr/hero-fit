import { expect, test, type Page } from "@playwright/test";
import { registerUser } from "./helpers";

const section = (page: Page, title: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: title, level: 2 }) });

const card = (page: Page, name: string) =>
  page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name, exact: true, level: 3 }) });

test.beforeEach(async ({ page }) => {
  await registerUser(page);
  await page.goto("/exercises");
});

test("built-in exercises are grouped by primary muscle and read-only", async ({ page }) => {
  await expect(section(page, "Грудь").getByRole("heading", { name: "Жим штанги лёжа" })).toBeVisible();
  await expect(section(page, "Икры").getByRole("heading", { name: "Подъём на носки стоя" })).toBeVisible();
  await expect(card(page, "Жим штанги лёжа").getByRole("button", { name: "Действия" })).toHaveCount(0);
});

test("filter by muscle group and search", async ({ page }) => {
  await page.getByRole("link", { name: "Икры" }).click();
  await expect(page).toHaveURL(/group=CALVES/);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);

  // Фильтр по вторичной группе: становая тяга (основная — спина) находится в «Предплечья».
  await page.getByRole("link", { name: "Предплечья" }).click();
  await expect(page.getByRole("heading", { name: "Становая тяга" })).toBeVisible();

  await page.getByRole("link", { name: "Все" }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  await page.getByPlaceholder("Поиск по названию").fill("присед");
  await page.getByPlaceholder("Поиск по названию").press("Enter");
  await expect(page).toHaveURL(/q=%D0%BF/);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Приседания со штангой" })).toBeVisible();

  await page.getByPlaceholder("Поиск по названию").fill("несуществующее");
  await page.getByPlaceholder("Поиск по названию").press("Enter");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
});

test("create, validate, edit, delete and restore an exercise", async ({ page }) => {
  const dialog = page.getByRole("dialog");

  // Валидация
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Название — минимум 2 символа")).toBeVisible();
  await expect(dialog.getByText("Выберите хотя бы одну группу мышц")).toBeVisible();

  // Совпадение со встроенным (без учёта регистра)
  await dialog.getByLabel("Название").fill("жим штанги ЛЁЖА");
  await dialog.getByRole("button", { name: "Грудь", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText("Упражнение с таким названием уже есть")).toBeVisible();

  // Создание: Грудь + Трицепс, основной делаем Трицепс
  await dialog.getByLabel("Название").fill("Отжимания узким хватом");
  await dialog.getByRole("button", { name: "Трицепс", exact: true }).click();
  await dialog.getByRole("button", { name: "Сделать «Трицепс» основной" }).click();
  await dialog.getByRole("button", { name: "120", exact: true }).click();
  await dialog.getByRole("checkbox", { name: /Со своим весом/ }).check();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Упражнение добавлено")).toBeVisible();

  const created = section(page, "Трицепс").locator(card(page, "Отжимания узким хватом"));
  await expect(created).toBeVisible();
  await expect(created.getByText("моё")).toBeVisible();
  await expect(created.getByText("отдых 120 с")).toBeVisible();
  await expect(created.getByText("свой вес")).toBeVisible();

  // Редактирование
  await created.getByRole("button", { name: "Действия" }).click();
  await page.getByRole("menuitem", { name: "Редактировать" }).click();
  await expect(dialog.getByLabel("Название")).toHaveValue("Отжимания узким хватом");
  await expect(dialog.getByRole("checkbox", { name: /Со своим весом/ })).toBeChecked();
  await dialog.getByLabel("Название").fill("Алмазные отжимания");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  const edited = card(page, "Алмазные отжимания");
  await expect(edited).toBeVisible();
  await expect(card(page, "Отжимания узким хватом")).toHaveCount(0);

  // Удаление (с подтверждением)
  await edited.getByRole("button", { name: "Действия" }).click();
  await page.getByRole("menuitem", { name: "Удалить" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("«Алмазные отжимания» удалено")).toBeVisible();
  await expect(card(page, "Алмазные отжимания")).toHaveCount(0);

  // Повторное создание с тем же именем — архивная запись восстанавливается без ошибки unique
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  await dialog.getByLabel("Название").fill("Алмазные отжимания");
  await dialog.getByRole("button", { name: "Грудь", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
  await expect(section(page, "Грудь").locator(card(page, "Алмазные отжимания"))).toBeVisible();
});

test("user's exercises are private", async ({ page, browser }) => {
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Секретное упражнение");
  await dialog.getByRole("button", { name: "Пресс", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(card(page, "Секретное упражнение")).toBeVisible();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerUser(otherPage);
  await otherPage.goto("/exercises?q=Секретное");
  await expect(otherPage.getByText("Ничего не найдено")).toBeVisible();
  await other.close();
});
