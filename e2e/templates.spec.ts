import { expect, test, type Page } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true });

async function pick(page: Page, names: string[]) {
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const dialog = page.getByRole("dialog");
  for (const name of names) {
    await dialog.getByLabel("Поиск упражнения").fill(name);
    await dialog.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  }
  await dialog.getByRole("button", { name: /^Добавить \(/ }).click();
}

test.beforeEach(async ({ page }) => {
  await registerUser(page);
  await page.goto("/templates");
});

test("create template with targets, start it, edit and delete", async ({ page }) => {
  await page.getByRole("link", { name: "Новый шаблон" }).click();
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(page.getByText("Введите название")).toBeVisible();
  await expect(page.getByText("Добавьте хотя бы одно упражнение")).toBeVisible();

  await page.getByLabel("Название").fill("Моя грудь");
  await pick(page, ["Жим штанги лёжа", "Отжимания на брусьях"]);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });
  await bench.getByLabel("Подходы").fill("4");
  await bench.getByLabel("Повторы").fill("6");
  await bench.getByLabel("Вес, кг").fill("70");
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();

  await expect(page).toHaveURL(/\/templates$/);
  await expect(card(page, "Моя грудь")).toContainText("Жим штанги лёжа");
  await expect(card(page, "Моя грудь")).toContainText("×4");

  // Редактирование: убираем упражнение
  await card(page, "Моя грудь").getByRole("link", { name: "Изменить «Моя грудь»" }).click();
  await expect(page.getByLabel("Название")).toHaveValue("Моя грудь");
  await page.getByRole("button", { name: "Убрать «Отжимания на брусьях»" }).click();
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(card(page, "Моя грудь")).not.toContainText("Отжимания");

  // Запуск в один клик: цели шаблона → подходы тренировки
  await card(page, "Моя грудь").getByRole("button", { name: "Начать «Моя грудь»" }).click();
  await expect(page).toHaveURL(/\/training$/);
  const block = page.getByRole("region", { name: "Жим штанги лёжа" });
  await expect(block.getByTestId("set-row")).toHaveCount(4);
  await expect(block.getByLabel("Вес, подход 1")).toHaveValue("70");
  await expect(block.getByLabel("Повторы, подход 4")).toHaveValue("6");
  await page.getByRole("button", { name: "Действия с тренировкой" }).click();
  await page.getByRole("menuitem", { name: "Отменить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отменить тренировку" }).click();

  // Удаление
  await page.goto("/templates");
  await card(page, "Моя грудь").getByRole("button", { name: "Удалить «Моя грудь»" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Шаблон «Моя грудь» удалён")).toBeVisible();
  await expect(card(page, "Моя грудь")).toHaveCount(0);
});

test("copy a ready-made program into my templates", async ({ page }) => {
  await card(page, "Pull").getByRole("button", { name: "Копировать «Pull» в мои шаблоны" }).click();
  await expect(page).toHaveURL(/\/templates\/\w+$/);
  await expect(page.getByLabel("Название")).toHaveValue("Pull");
  await expect(page.locator("main section[aria-label]")).toHaveCount(6);
  await page.getByLabel("Название").fill("Мой Pull");
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(card(page, "Мой Pull")).toContainText("Становая тяга");
  await expect(card(page, "Pull")).toBeVisible(); // программа осталась нетронутой
});

test("exercises added during a workout can be saved back into the template", async ({ page }) => {
  await card(page, "5×5 — день A").getByRole("button", { name: /Копировать/ }).click();
  await page.getByLabel("Название").fill("Мой 5×5");
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await card(page, "Мой 5×5").getByRole("button", { name: "Начать «Мой 5×5»" }).click();

  await addToWorkout(page, ["Шраги со штангой"]);
  const squat = page.getByRole("region", { name: "Приседания со штангой" });
  await squat.getByLabel("Вес, подход 1").fill("100");
  await squat.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);

  await page.getByRole("button", { name: "Обновить шаблон «Мой 5×5»" }).click();
  await expect(page.getByText("Шаблон «Мой 5×5» обновлён")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Обновить шаблон/ })).toHaveCount(0);

  await page.goto("/templates");
  await expect(card(page, "Мой 5×5")).toContainText("Приседания со штангой");
  await expect(card(page, "Мой 5×5")).not.toContainText("Шраги"); // не выполняли — в историю и шаблон не попали
});

test("a template with a long exercise name does not widen the card or the page", async ({ page }) => {
  const exercise = "Жим с очень длинным названием, которое не помещается в карточку шаблона";
  await page.goto("/exercises");
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill(exercise);
  await dialog.getByRole("button", { name: "Грудь", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/templates");
  await page.getByRole("link", { name: "Новый шаблон" }).click();
  await page.getByLabel("Название").fill("Длинный");
  await pick(page, [exercise]);
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(page).toHaveURL(/\/templates$/);

  const box = (await card(page, "Длинный").boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
