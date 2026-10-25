import { expect, test } from "@playwright/test";
import { withDb } from "./db";
import { registerUser } from "./helpers";
import { mockNativeApp } from "./native-mock";

// Счётчик скачиваний APK общий на базу — сценарии по очереди; приложение мокается одинаково на любом экране — desktop.
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Счётчик общий, приложение — мок");
});

const downloads = () => withDb(async (db) => (await db.query<{ n: number }>(`select coalesce(sum(count), 0)::int n from "ApkDownload"`)).rows[0].n);

const appVisits = (login: string) =>
  withDb(
    async (db) =>
      (
        await db.query<{ version: string | null }>(
          `select v.version from "AppVisit" v join "User" u on u.id = v."userId" where u.login = $1`,
          [login],
        )
      ).rows,
  );

const register = { endpoint: "https://127.0.0.1/upStatsAbcdef", p256dh: "p", auth: "a" };

test("APK download: counted and redirected to the file; bots are not counted", async ({ request }) => {
  const before = await downloads();
  const res = await request.get("/download/hero-fit.apk", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe("/apk/hero-fit.apk");
  expect(await downloads()).toBe(before + 1);

  const bot = await request.get("/download/hero-fit.apk", { maxRedirects: 0, headers: { "user-agent": "Mozilla/5.0 (compatible; YandexBot/3.0)" } });
  expect(bot.status()).toBe(302);
  expect(await downloads()).toBe(before + 1);
});

test("app visit is recorded once a day with the app version; browser visits are not", async ({ page, browser }) => {
  await mockNativeApp(page, { register });
  const { login } = await registerUser(page);
  await page.goto("/dashboard");
  await expect.poll(() => appVisits(login)).toEqual([{ version: "1.0.0" }]);
  await page.reload();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await appVisits(login)).toEqual([{ version: "1.0.0" }]);

  const web = await browser.newPage();
  const other = await registerUser(web);
  await web.goto("/dashboard");
  await expect(web.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await appVisits(other.login)).toEqual([]);
  await web.close();
});

test("registration inside the app is attributed to the Android app", async ({ page }) => {
  await mockNativeApp(page, { register });
  const { login } = await registerUser(page);
  const landing = await withDb(async (db) => (await db.query<{ l: string }>(`select "signupLanding" l from "User" where login = $1`, [login])).rows[0].l);
  expect(landing).toBe("android-app");
});
