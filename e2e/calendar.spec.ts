import { expect, test, type Page } from "@playwright/test";
import { registerUser } from "./helpers";

// Неделя 7–13 января 2030 (пн–вс) — всегда в будущем: статусы «запланировано»
const THURSDAY = "/calendar?date=2030-01-10";

async function fillPlan(page: Page, { repeat }: { repeat: string[] }) {
  const dialog = page.getByRole("dialog", { name: "Новая тренировка" });
  await dialog.getByLabel("Шаблон").selectOption({ label: "Push" });
  await dialog.getByRole("checkbox", { name: "Повторять каждую неделю" }).check();
  for (const day of repeat) await dialog.getByRole("button", { name: day, exact: true }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
}

test("calendar in the navigation", async ({ page, isMobile }) => {
  await registerUser(page);
  const nav = isMobile ? page.getByRole("navigation").last() : page.getByRole("complementary").getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Календарь" })).toBeVisible();
  if (isMobile) await expect(nav.getByRole("link", { name: "Шаблоны" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Календарь" }).click();
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
});

test("create a weekly plan and see it in week and month views", async ({ page, isMobile }) => {
  await registerUser(page);
  await page.goto(THURSDAY);

  if (isMobile) {
    // Телефон: выбранный день — четверг, создание кнопкой (время по умолчанию 18:00)
    await expect(page.getByRole("button", { name: "Чт 10", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Запланировать", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Новая тренировка" }).getByLabel("Начало")).toHaveValue("18:00");
  } else {
    await page.getByRole("button", { name: "Запланировать: четверг, 10 января, 18:00" }).click();
  }
  // Четверг отмечен сам; добавляем понедельник
  await fillPlan(page, { repeat: ["Пн"] });

  const event = page.getByRole("button", { name: /^Push, четверг, 10 января, 18:00–19:00, запланировано/ });
  await expect(event).toBeVisible();

  // Следующая неделя: понедельник 14 января
  await page.getByRole("link", { name: "Следующая неделя" }).click();
  if (isMobile) await page.getByRole("button", { name: "Пн 14", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Push, понедельник, 14 января, 18:00–19:00/ })).toBeVisible();

  // Месяц: плашки по понедельникам и четвергам с 10 января
  await page.getByRole("link", { name: "Месяц" }).click();
  await expect(page.getByRole("heading", { name: "Январь 2030" })).toBeVisible();
  if (!isMobile) {
    const day = page.getByRole("gridcell", { name: /^10 января/ });
    await expect(day.getByText("18:00 Push")).toBeVisible();
    await expect(page.getByRole("gridcell", { name: /^7 января/ }).getByText("18:00 Push")).toHaveCount(0); // до начала серии
    await expect(page.getByRole("gridcell", { name: /^31 января/ }).getByText("18:00 Push")).toBeVisible();
  } else {
    await page.getByRole("gridcell", { name: /^31 января/ }).click();
    await expect(page.getByRole("button", { name: /^Push, четверг, 31 января, 18:00–19:00/ })).toBeVisible();
  }
});

test("event card: edit only this occurrence, delete this and following", async ({ page }) => {
  await registerUser(page);
  await page.goto(THURSDAY);
  await page.getByRole("button", { name: "Запланировать", exact: true }).click();
  await fillPlan(page, { repeat: [] });

  await page.getByRole("button", { name: /^Push, четверг, 10 января, 18:00/ }).click();
  const card = page.getByRole("dialog", { name: "Push" });
  await expect(card).toContainText("Каждую неделю: чт");
  await card.getByRole("button", { name: "Изменить" }).click();
  const form = page.getByRole("dialog", { name: "Изменить тренировку" });
  await form.getByLabel("Начало").fill("07:30");
  await form.getByRole("button", { name: "Сохранить" }).click();
  await page.getByRole("dialog", { name: "Повторяющаяся тренировка" }).getByRole("button", { name: "Только эту" }).click();
  await expect(page.getByRole("button", { name: /^Push, четверг, 10 января, 07:30–08:30/ })).toBeVisible();

  // Через неделю — по-прежнему 18:00; удаляем её и все следующие
  await page.getByRole("link", { name: "Следующая неделя" }).click();
  await page.getByRole("button", { name: /^Push, четверг, 17 января, 18:00/ }).click();
  await page.getByRole("dialog", { name: "Push" }).getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("dialog", { name: "Повторяющаяся тренировка" }).getByRole("button", { name: "Эту и следующие" }).click();
  await expect(page.getByRole("button", { name: /^Push, четверг, 17 января/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Предыдущая неделя" }).click();
  await expect(page.getByRole("button", { name: /^Push, четверг, 10 января, 07:30/ })).toBeVisible();
});
