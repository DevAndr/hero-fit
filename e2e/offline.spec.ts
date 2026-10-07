import { expect, test, type Page } from "@playwright/test";
import { userId, withDb } from "./db";
import { addToWorkout, registerUser } from "./helpers";

/** Копия редактора /training лежит в кэше service worker'а — без сети страница откроется. */
async function waitForOfflineCopy(page: Page) {
  await page.waitForFunction(async () => {
    const cached = await (await caches.open("hf-pages-v1")).match("/training");
    return Boolean(cached && (await cached.text()).includes("Название тренировки"));
  });
}

test("no signal in the gym: sets saved on the device, page reopens offline, finish queued and synced later", async ({
  page,
  context,
}) => {
  test.slow();
  const { login } = await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await waitForOfflineCopy(page);

  // Связь пропала
  await context.setOffline(true);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });
  await bench.getByLabel("Вес, подход 1").fill("70");
  await bench.getByLabel("Повторы, подход 1").fill("10");
  await bench.getByRole("button", { name: "Подход 1 выполнен" }).click(); // старт — на устройстве
  await expect(page.getByTestId("elapsed")).toBeVisible();
  await expect(page.getByTestId("save-status")).toContainText("Нет сети — сохранено на устройстве");

  // Перезагрузка без сети: страница из кэша, подходы — с устройства
  await page.reload();
  await expect(page.getByText("Восстановлено с устройства")).toBeVisible();
  const restored = page.getByRole("region", { name: "Жим штанги лёжа" });
  await expect(restored.getByLabel("Вес, подход 1")).toHaveValue("70");
  await expect(restored.locator("[data-done]")).toHaveCount(1);
  await expect(page.getByTestId("elapsed")).toBeVisible();

  // Завершение без сети — в очередь, время с устройства
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  const queued = page.getByRole("region", { name: "Завершение ждёт сети" });
  await expect(queued).toContainText("Тренировка завершена на устройстве");
  const finishedOffline = Date.now();
  await page.waitForTimeout(3000);

  // Сеть вернулась — отправляем по кнопке
  await context.setOffline(false);
  await queued.getByRole("button", { name: "Отправить сейчас" }).click();
  await expect(page).toHaveURL(/\/workouts\//, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /готово!/ })).toBeVisible();

  await withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query(
      // Колонка без пояса (там UTC) — берём миллисекунды из БД, иначе pg прочитает её как местное время
      `select status, (extract(epoch from "finishedAt") * 1000)::float8 as "finishedMs", "totalSets", "totalVolume"
       from "Workout" where "userId" = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "COMPLETED", totalSets: 1, totalVolume: 700 });
    // Время завершения — момент без сети, а не момент синхронизации
    expect(Math.abs(rows[0].finishedMs - finishedOffline)).toBeLessThan(2500);
  });
  // Черновик с устройства убран
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hf:workout:")))).toEqual([]);
});

test("draft edited offline goes to the server by itself when the network is back", async ({ page, context }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Приседания со штангой"]);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");

  await context.setOffline(true);
  await page.getByRole("region", { name: "Приседания со штангой" }).getByLabel("Вес, подход 1").fill("100");
  await expect(page.getByTestId("save-status")).toContainText("Нет сети");
  await expect(page.getByRole("button", { name: "Синхронизировать" })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено", { timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("region", { name: "Приседания со штангой" }).getByLabel("Вес, подход 1")).toHaveValue("100");
});
