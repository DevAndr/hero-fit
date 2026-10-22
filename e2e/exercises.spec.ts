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

test("glutes: own section for hip exercises, compound leg lifts found by the secondary group", async ({ page }) => {
  await expect(section(page, "Ягодицы").getByRole("heading", { name: "Ягодичный мост со штангой" })).toBeVisible();
  await expect(section(page, "Ягодицы").getByRole("heading", { name: "Отведение ноги в кроссовере" })).toBeVisible();
  await expect(card(page, "Ягодичный мост со штангой").getByText("Ягодицы", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Ягодицы", exact: true }).click();
  await expect(page).toHaveURL(/group=GLUTES/);
  for (const name of ["Приседания со штангой", "Румынская тяга", "Выпады с гантелями", "Жим ногами", "Становая тяга"]) {
    await expect(page.getByRole("heading", { name, exact: true }).first()).toBeVisible();
  }
});

test("popular gym basics are in the built-in base, each under its primary group", async ({ page }) => {
  const expected: [string, string][] = [
    ["Грудь", "Жим гантелей лёжа"],
    ["Грудь", "Отжимания"],
    ["Спина", "Тяга гантели в наклоне"],
    ["Спина", "Гиперэкстензия"],
    ["Ноги", "Разгибание ног в тренажёре"],
    ["Ноги", "Сгибание ног в тренажёре"],
    ["Ноги", "Болгарские сплит-приседания"],
    ["Плечи", "Жим гантелей сидя"],
    ["Бицепс", "Подъём гантелей на бицепс"],
    ["Трицепс", "Жим лёжа узким хватом"],
    ["Пресс", "Ролик для пресса"],
  ];
  for (const [group, name] of expected) {
    await expect(section(page, group).getByRole("heading", { name, exact: true, level: 3 })).toBeVisible();
  }
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
  await page.getByPlaceholder("Поиск по названию").fill("приседания со");
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

test("mobile: search and groups stick under the header, picker filter stays after scrolling", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, "липкие фильтры — только уже sm");
  const search = page.getByPlaceholder("Поиск по названию");
  const header = page.locator("header").first();
  await page.getByRole("heading", { level: 3 }).last().scrollIntoViewIfNeeded();
  await expect(search).toBeInViewport();
  await expect(page.getByRole("link", { name: "Все", exact: true })).toBeInViewport();
  // Не под шапкой
  const headerBottom = (await header.boundingBox())!.y + (await header.boundingBox())!.height;
  expect((await search.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom - 1);

  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("list", { name: "Список упражнений" }).getByRole("listitem").last().scrollIntoViewIfNeeded();
  await expect(dialog.getByLabel("Поиск упражнения")).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Все", exact: true })).toBeInViewport();
});

test("a long exercise name is truncated and does not widen the card or the page", async ({ page }) => {
  const name = "Новое упражнение с очень длинным названием, которое не помещается в карточку";
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill(name);
  await dialog.getByRole("button", { name: "Грудь", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();

  const own = card(page, name).first();
  await own.scrollIntoViewIfNeeded();
  await expect(own).toBeVisible();
  const list = (await section(page, "Грудь").boundingBox())!;
  const box = (await own.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(list.x + list.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // Название обрезано многоточием, бейдж «моё» виден целиком
  await expect(own.getByText("моё", { exact: true })).toBeInViewport({ ratio: 1 });
});
