import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test("landing is public: hero, features, FAQ and structured data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Дневник тренировок, который превращает зал в игру/);
  await expect(page.getByRole("heading", { name: "Всё для прогресса — и немного игры" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Недельный streak", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сейчас всё бесплатно" })).toBeVisible();
  await expect(page.getByText("Год Премиума в подарок.")).toBeVisible();
  await page.getByText("Hero Fit бесплатный?").click();
  await expect(page.getByText("останутся бесплатными навсегда")).toBeVisible();

  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const types = (JSON.parse(ld!) as { "@type": string }[]).map((x) => x["@type"]);
  expect(types).toEqual(["WebSite", "SoftwareApplication", "FAQPage"]);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);

  await page.getByRole("link", { name: "Начать бесплатно" }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test("privacy policy is public and linked from the footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Политика конфиденциальности" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Политика конфиденциальности" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "5. Cookies и Яндекс.Метрика" })).toBeVisible();
  // Без номера счётчика в сборке Метрика не подключается и уведомления о cookies нет
  await expect(page.getByRole("region", { name: "Уведомление о cookies" })).toHaveCount(0);
  expect(await page.evaluate(() => "ym" in window)).toBe(false);
});

test("SEO files: robots closed outside public production, sitemap, OG image", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  // Ровно «Disallow: /» (весь сайт), а не «Disallow: /api/» из боевых правил
  expect(robots).toMatch(/^Disallow: \/$/m);
  expect(robots).not.toMatch(/^Allow:/m);
  expect(robots).not.toContain("hero-fit.ru");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/tools/1rm", "/tools/plates", "/register", "/privacy"]) expect(sitemap).toContain(`${path}</loc>`);
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
});

test("1RM calculator works without an account", async ({ page }) => {
  await page.goto("/tools/1rm");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Калькулятор 1ПМ");
  await expect(page.getByTestId("one-rm-result")).toHaveText("116,7 кг");
  await page.getByLabel("Повторы").fill("1");
  await expect(page.getByTestId("one-rm-result")).toHaveText("100 кг");
  await expect(page.getByRole("navigation", { name: "Хлебные крошки" })).toContainText("Калькулятор 1ПМ");
});

test("plate calculator: plates per side, bar choice and warm-up", async ({ page }) => {
  await page.goto("/tools/plates");
  await expect(page.getByTestId("plates-per-side")).toHaveText("25 + 15 кг");
  await expect(page.getByTestId("warmup")).toContainText("80 кг × 2");
  await page.getByRole("button", { name: "15 кг" }).click();
  await expect(page.getByTestId("plates-per-side")).toHaveText("25 + 15 + 2,5 кг");
  await page.getByLabel("Вес на штанге, кг").fill("101");
  await expect(page.getByText("Ровно 101 кг не собрать")).toBeVisible();
});

test("private pages are noindex; signed-in header offers the dashboard", async ({ page }) => {
  await registerUser(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/");
  await page.getByRole("link", { name: "Открыть кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
