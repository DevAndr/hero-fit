import { expect, test, type Page } from "@playwright/test";
import { quickWorkout, registerUser } from "./helpers";

// Карточки рекордов: тумблер в /settings (по умолчанию выключен), окно «Новый рекорд!» в сводке после тренировки
// с рекордом, PNG 1080×1920 по своей тренировке.

/** PNG: подпись и размер из заголовка IHDR. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Новый рекорд!" });
const toggle = (page: Page) => page.getByRole("switch", { name: "Показывать карточку после рекорда" });

/** Две тренировки: вторая бьёт рекорд веса первой. Возвращает путь сводки второй. */
async function beatRecord(page: Page) {
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);
  await expect(page).toHaveURL(/\/workouts\//);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "65", reps: "10" }]);
  await expect(page).toHaveURL(/\/workouts\//);
  // Заголовок «Новые рекорды» проверяют сами тесты: всплывшее окно прячет страницу от доступности
  return new URL(page.url()).pathname;
}

test("off by default: no record card after a record", async ({ page }) => {
  test.slow();
  await registerUser(page);
  await page.goto("/settings");
  await expect(toggle(page)).not.toBeChecked();
  await beatRecord(page);
  await expect(page.getByRole("heading", { name: "Новые рекорды" })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Карточка рекорда" })).toHaveCount(0);
});

test("on: the card pops up once after a record, can be shared and reopened", async ({ page }, info) => {
  test.slow();
  await registerUser(page);
  await page.goto("/settings");
  await toggle(page).click();
  await expect(toggle(page)).toBeChecked();
  await page.reload();
  await expect(toggle(page)).toBeChecked();

  const summary = await beatRecord(page);
  await expect(dialog(page)).toBeVisible();
  const img = dialog(page).getByRole("img", { name: /Жим штанги лёжа/ });
  await expect(img).toHaveAttribute("src", `${summary}/records/0/card`);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1080);

  if (info.project.name === "desktop") {
    // В headless нет Web Share с файлами — скачивание
    const download = page.waitForEvent("download");
    await dialog(page).getByRole("button", { name: "Поделиться" }).click();
    expect((await download).suggestedFilename()).toMatch(/^hero-fit-record-\d{4}-\d{2}-\d{2}\.png$/);
  }
  await dialog(page).getByRole("button", { name: "Закрыть" }).first().click();
  await expect(dialog(page)).toHaveCount(0);

  // Второй раз сама не всплывает, но открывается кнопкой у рекордов
  await page.reload();
  await expect(page.getByRole("heading", { name: "Новые рекорды" })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Карточка рекорда" }).click();
  await expect(dialog(page)).toBeVisible();
});

test("card image: 1080×1920 PNG of own workout only", async ({ page, browser }) => {
  test.slow();
  await registerUser(page);
  const summary = await beatRecord(page);

  const res = await page.request.get(`${summary}/records/0/card`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(pngSize(await res.body())).toEqual({ width: 1080, height: 1920 });
  // Рекорда с таким номером нет
  expect((await page.request.get(`${summary}/records/1/card`)).status()).toBe(404);
  expect((await page.request.get(`${summary}/records/x/card`)).status()).toBe(404);

  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await registerUser(otherPage);
    expect((await otherPage.request.get(`${summary}/records/0/card`)).status()).toBe(404);
  } finally {
    await other.close();
  }
});
