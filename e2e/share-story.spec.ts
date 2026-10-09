import { expect, test } from "@playwright/test";
import { quickWorkout, registerUser } from "./helpers";

/** PNG: подпись и размер из заголовка IHDR. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("summary «Поделиться» gives a 1080×1920 story image; others' workouts are 404", async ({ page, browser }, info) => {
  test.slow(); // регистрация (argon2) + тренировка + генерация картинки
  await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);
  await expect(page).toHaveURL(/\/workouts\//);
  const url = new URL(page.url()).pathname;

  // В браузере без Web Share с файлами (как в headless) — скачивание
  if (info.project.name === "desktop") {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Поделиться" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^hero-fit-\d{4}-\d{2}-\d{2}\.png$/);
  }

  const res = await page.request.get(`${url}/story`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.body();
  expect(pngSize(body)).toEqual({ width: 1080, height: 1920 });
  expect(body.length).toBeGreaterThan(20_000);

  // Чужой пользователь картинку не получает
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await registerUser(otherPage);
    expect((await otherPage.request.get(`${url}/story`)).status()).toBe(404);
  } finally {
    await other.close();
  }
});

test("story image requires sign-in", async ({ request }) => {
  const res = await request.get("/workouts/some-id/story", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/\/login\?next=/);
});
