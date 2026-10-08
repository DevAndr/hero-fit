import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { userId, withDb } from "./db";
import { pickOption, registerUser } from "./helpers";

// Неделя 7–13 января 2030 (пн–вс) — всегда в будущем: статусы «запланировано»
const THURSDAY = "/calendar?date=2030-01-10";

async function fillPlan(page: Page, { repeat }: { repeat: string[] }) {
  const dialog = page.getByRole("dialog", { name: "Новая тренировка" });
  await pickOption(page, dialog.getByLabel("Шаблон"), "Push");
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

test("drag a plan to another day and time (mouse and keyboard)", async ({ page, isMobile }) => {
  test.skip(isMobile, "перетаскивание — только на ПК");
  await registerUser(page);
  await page.goto(THURSDAY);
  await page.getByRole("button", { name: "Запланировать: четверг, 10 января, 18:00" }).click();
  await fillPlan(page, { repeat: [] });

  // Мышь: четверг 18:00 → пятница 16:00
  const event = page.getByRole("button", { name: /^Push, четверг, 10 января, 18:00/ });
  const slot = page.getByRole("button", { name: "Запланировать: пятница, 11 января, 16:00" });
  await event.scrollIntoViewIfNeeded();
  const from = (await event.boundingBox())!;
  const to = (await slot.boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 15, { steps: 5 });
  await page.mouse.move(to.x + 10, to.y + 5, { steps: 15 });
  await page.mouse.up();
  await page.getByRole("dialog", { name: "Повторяющаяся тренировка" }).getByRole("button", { name: "Только эту" }).click();
  await expect(page.getByRole("button", { name: /^Push, пятница, 11 января, 16:00–17:00/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Push, четверг, 10 января/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Следующая неделя" }).click();
  await expect(page.getByRole("button", { name: /^Push, четверг, 17 января, 18:00/ })).toBeVisible(); // серия на месте
  await page.getByRole("link", { name: "Предыдущая неделя" }).click();

  // Клавиатура: разовая тренировка вт 07:00 → ср 08:00 (без вопроса о повторе)
  await page.getByRole("button", { name: "Запланировать", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новая тренировка" });
  await pickOption(page, dialog.getByLabel("Шаблон"), "Pull");
  await dialog.getByLabel("Дата").fill("2030-01-08");
  await dialog.getByLabel("Начало").fill("07:00");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  // Закрытый диалог возвращает фокус на «Запланировать» — дожидаемся, иначе он уведёт фокус с события
  await expect(page.getByRole("button", { name: "Запланировать", exact: true })).toBeFocused();
  const pull = page.getByRole("button", { name: /^Pull, вторник, 8 января, 07:00/ });
  await pull.focus();
  await expect(pull).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^Pull, среда, 9 января, 08:00–09:00/ })).toBeVisible();

  // Enter по-прежнему открывает карточку (перенос — только пробелом)
  await page.getByRole("button", { name: /^Pull, среда, 9 января/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Pull" })).toBeVisible();
});

/** Разовый план на день (offset — дней от сегодня в поясе пользователя). */
async function addPlan(login: string, title: string, offset: number, time = "18:00") {
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(
      `insert into "PlanEntry" (id, "userId", title, date, time, "durationMin", "updatedAt")
       select $2, u.id, $3, to_char((now() AT TIME ZONE u."timeZone") + make_interval(days => $4), 'YYYY-MM-DD'), $5, 60, now()
       from "User" u where u.id = $1`,
      [id, randomUUID(), title, offset, time],
    );
  });
}

test("today's plan: dashboard card → start → finish → done in the calendar; training shortcut", async ({ page }) => {
  test.slow(); // полная тренировка — под параллельной нагрузкой не укладывается в 30 с
  const { login } = await registerUser(page);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Запланировать", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новая тренировка" });
  await pickOption(page, dialog.getByLabel("Шаблон"), "Push");
  await dialog.getByLabel("Начало").fill("23:30"); // сегодня, позже «сейчас»
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();

  // «Тренировка»: план первым вариантом
  await page.goto("/training");
  await expect(page.getByRole("button", { name: /По плану: Push · 23:30/ })).toBeVisible();

  // Дашборд: «Сегодня по плану» → Начать
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "План на сегодня" });
  await expect(card).toContainText("Сегодня по плану: Push · 23:30");
  await card.getByRole("button", { name: "Начать" }).click();
  await expect(page.getByLabel("Название тренировки")).toHaveValue("Push");
  await expect(page.locator("main section[aria-label]")).toHaveCount(5); // упражнения шаблона

  // Пока тренировка идёт — «Продолжить»
  await page.goto("/dashboard");
  await expect(card.getByRole("link", { name: "Продолжить" })).toBeVisible();

  await page.goto("/training");
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });
  await bench.getByLabel("Вес, подход 1").fill("50");
  await bench.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\/\w+$/);

  await page.goto("/calendar");
  const done = page.getByRole("button", { name: /^Push, .*, 23:30–00:30, выполнено$/ }).first();
  await done.click();
  await expect(page.getByRole("dialog", { name: "Push" }).getByRole("link", { name: "Открыть сводку" })).toBeVisible();

  // Вчерашний пропущенный план — предложение сделать сегодня
  await addPlan(login, "Ноги", -1);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "План на сегодня" })).toContainText("Вчера были Ноги — сделать сегодня?");
});
