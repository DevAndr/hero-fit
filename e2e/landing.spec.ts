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
  const doc = JSON.parse(ld!) as { "@context": string; "@graph": { "@type": string }[] };
  expect(doc["@context"]).toBe("https://schema.org");
  const types = doc["@graph"].map((x) => x["@type"]);
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

test("coaches block: ten features, header link, CTA opens coach sign-up", async ({ page }) => {
  await page.goto("/");
  const block = page.getByRole("region", { name: "Ведите клиентов там, где им интересно тренироваться" });
  await expect(block.getByRole("list").first().getByRole("listitem")).toHaveCount(10);
  for (const title of ["Приглашение по ссылке", "Клиенты в одном списке", "Итоги недели", "Тренировки в календарь", "Программы на несколько недель", "Задания и прогрессия", "Комментарии к тренировкам", "Заметки о клиенте", "Своя страница тренера", "Каталог тренеров"]) {
    await expect(block.getByRole("heading", { name: title })).toBeVisible();
  }
  await block.getByRole("link", { name: "Стать тренером — бесплатно" }).click();
  await expect(page).toHaveURL(/\/register\?coach=1$/);
  await expect(page.getByRole("checkbox", { name: /Я тренер/ })).toBeChecked();
  await expect(page.getByLabel("Публичный ник")).toBeVisible();
});

test("header links to the coaches block", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Разделы сайта" }).getByRole("link", { name: "Тренерам" })).toHaveAttribute("href", "/#coaches");
});

test("landing offers Hero Fit in Telegram", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("link", { name: "Открыть в Telegram" });
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) await expect(link).toHaveAttribute("href", "https://t.me/hero_fit_e2e_bot?startapp");
  await expect(page.getByText("Бесплатно · в браузере, Telegram и офлайн")).toBeVisible();
  await expect(page.getByText("Есть в Telegram")).toBeVisible();
});

test("guilds block: header link, raid infographic, CTA, FAQ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Разделы сайта" }).getByRole("link", { name: "Гильдии" })).toHaveAttribute("href", "/#guilds");
  const block = page.getByRole("region", { name: "Гильдии и рейды" });
  await expect(block).toContainText("до 10");
  await expect(block).toContainText("MVP");
  await expect(block.getByRole("link", { name: "Собрать гильдию" })).toHaveAttribute("href", "/register");
  await expect(page.getByRole("heading", { name: "Что такое гильдия и рейд?" })).toBeVisible();
});

test("header fits: no horizontal scroll on wide screens", async ({ page }) => {
  for (const width of [1280, 1440, 1536, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `ширина ${width}`).toBe(0);
  }
});

test("favicon: ICO plus a 120×120 PNG for search engines (Yandex recommends 120×120)", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('head link[rel="icon"][type="image/x-icon"]')).toHaveCount(1);
  const big = page.locator('head link[rel="icon"][sizes="120x120"][type="image/png"]');
  await expect(big).toHaveAttribute("href", "/pwa-icon/120");

  const icon = await request.get("/pwa-icon/120");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toBe("image/png");
  // PNG: ширина и высота — байты 16…23 заголовка IHDR
  const png = await icon.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([120, 120]);
});

test("public pages with their own social preview keep the site image", async ({ page }) => {
  for (const path of ["/training-programs", "/tools/1rm", "/tools/plates", "/tools/dots-wilks", "/trainers"]) {
    await page.goto(path);
    await expect(page.locator('meta[property="og:image"]'), path).toHaveAttribute("content", /\/opengraph-image/);
    await expect(page.locator('meta[property="og:site_name"]'), path).toHaveAttribute("content", "Hero Fit");
  }
});
