import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { landingUtmVisits, landingVisits } from "./db";
import { registerUser } from "./helpers";

// Счётчики пишутся фоном после ответа — проверяем поллингом; «не посчитано» — выждав, что запись успела бы дойти
const settle = () => new Promise((r) => setTimeout(r, 1500));
const tag = () => `e2e_${randomUUID().slice(0, 8)}`;

test("utm click counts on every visit", async ({ page }) => {
  const src = tag();
  await page.goto(`/?utm_source=${src}&utm_campaign=c1`);
  await page.goto(`/?utm_source=${src}&utm_campaign=c1`);
  await expect.poll(() => landingUtmVisits(src)).toBe(2);
});

test("first visit counts once", async ({ page, context }, info) => {
  // Пара tool × social — только у этого сценария; на mobile он шёл бы параллельно и путал дельту
  test.skip(info.project.name !== "desktop", "Общий счётчик пары");
  const before = await landingVisits("tool", "social");
  await page.goto("/tools/plates", { referer: "https://ok.ru/group/1" });
  expect((await context.cookies()).find((c) => c.name === "hf_src")?.value).toBe("tool.social");
  await expect.poll(() => landingVisits("tool", "social")).toBe(before + 1);
  await page.goto("/tools/plates", { referer: "https://ok.ru/group/1" });
  await settle();
  expect(await landingVisits("tool", "social")).toBe(before + 1);
});

test("bots are not counted", async ({ browser }) => {
  const src = tag();
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  const page = await ctx.newPage();
  await page.goto(`/?utm_source=${src}`);
  expect((await ctx.cookies()).some((c) => c.name === "hf_utm")).toBe(true);
  await settle();
  expect(await landingUtmVisits(src)).toBe(0);
  await ctx.close();
});

test("logged-in user and background prefetch are not counted", async ({ page }) => {
  const src = tag();
  await registerUser(page);
  await page.goto(`/?utm_source=${src}`);
  const res = await page.request.get(`/?utm_source=${src}`, { headers: { "next-url": "/register", "sec-fetch-dest": "empty" } });
  expect(res.ok()).toBe(true);
  await settle();
  expect(await landingUtmVisits(src)).toBe(0);
});
