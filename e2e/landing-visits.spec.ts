import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { landingUtmVisits, landingVisits } from "./db";
import { registerUser } from "./helpers";

// Счётчики пишутся фоном после ответа — проверяем поллингом; «не посчитано» — выждав, что запись успела бы дойти
const settle = () => new Promise((r) => setTimeout(r, 1500));
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
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

test("logged-in user is not counted", async ({ page }) => {
  const src = tag();
  await registerUser(page);
  await page.goto(`/?utm_source=${src}`);
  await settle();
  expect(await landingUtmVisits(src)).toBe(0);
});

test("guest background prefetch is not counted, a document request is", async ({ playwright }) => {
  // Отдельный контекст без cookie — гость; UA обычного Chrome, чтобы не отсечь как бота
  const guest = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, userAgent: CHROME_UA });
  const prefetch = tag();
  const res = await guest.get(`/?utm_source=${prefetch}`, { headers: { "next-url": "/", "sec-fetch-dest": "empty" } });
  expect(res.ok()).toBe(true);
  expect(res.headers()["set-cookie"] ?? "").not.toContain("hf_utm");

  const doc = tag();
  await guest.get(`/?utm_source=${doc}`, { headers: { "sec-fetch-dest": "document" } });
  await expect.poll(() => landingUtmVisits(doc)).toBe(1);
  expect(await landingUtmVisits(prefetch)).toBe(0);
  await guest.dispose();
});
