import { expect, test } from "@playwright/test";
import { coachProfile, createUserRow, enableCoach, resetFlag, setFlag } from "./db";
import { uniqueLogin } from "./helpers";

// Каталог тренеров для гостей: флаг coach_catalog глобально — отдельный проект trainers-global, последовательно, desktop.
test.describe.configure({ mode: "serial" });
test.beforeAll(() => setFlag("coach_catalog", { enabled: true, percent: 100 }));
test.afterAll(() => resetFlag("coach_catalog"));

const ABOUT = "Работаю с новичками и силовыми: базовые движения, техника, понятный прогресс каждую неделю.";

test("guest: the catalog and the trainer page are public, contacts are hidden", async ({ page }) => {
  const login = uniqueLogin();
  await createUserRow(login);
  const nick = `T_${login.replace(/[^a-z0-9]/g, "").slice(-15)}`;
  const city = `Гость${login.replace(/[^a-z0-9]/g, "").slice(-8)}`;
  await enableCoach(login, nick);
  await coachProfile(login, { about: ABOUT, publish: true, city, contacts: { phone: "+79991234567" }, consent: true, listed: true });

  await page.goto(`/trainers?city=${encodeURIComponent(city)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Тренеры Hero Fit" })).toBeVisible();
  const login1 = page.getByRole("link", { name: "Войдите, чтобы увидеть контакты" });
  await expect(login1).toHaveCount(1);
  expect(await login1.getAttribute("href")).toMatch(/^\/login\?next=%2Ftrainers/);
  expect(await page.content()).not.toContain("79991234567");

  await page.goto(`/trainer/${nick}`);
  await expect(page.getByRole("link", { name: "Войдите, чтобы увидеть контакты" })).toBeVisible();
  expect(await page.content()).not.toContain("79991234567");
});

test("sitemap lists /trainers", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toMatch(/<loc>[^<]*\/trainers<\/loc>/);
});

test("landing: «Тренеры» in the header and the footer, FAQ question, the header fits 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Разделы сайта" }).getByRole("link", { name: "Тренеры" })).toHaveAttribute("href", "/trainers");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Найти тренера" })).toHaveAttribute("href", "/trainers");
  await expect(page.getByRole("heading", { name: "Как найти тренера?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expect(page.getByRole("banner").getByRole("link", { name: "Начать бесплатно" })).toBeInViewport();
});
