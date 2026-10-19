import { expect, test } from "@playwright/test";
import { userId, withDb } from "./db";
import { PASSWORD, registerUser, uniqueLogin } from "./helpers";

test("список программ открывается без входа", async ({ page }) => {
  await page.goto("/training-programs");
  await expect(page).toHaveURL(/\/training-programs$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Программы тренировок в зал");
  await expect(page.locator('main a[href^="/training-programs/"]')).toHaveCount(5);
});

test("страница программы 5×5: мета, JSON-LD, таблица и кнопка старта", async ({ page }) => {
  await page.goto("/training-programs/5x5");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Программа 5×5 для силы");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/training-programs\/5x5$/);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.flatMap((b) => {
    const parsed = JSON.parse(b);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((d: { "@type": string }) => d["@type"]);
  });
  expect(types).toContain("ExercisePlan");

  await expect(page).toHaveTitle("Программа 5×5 для силы: присед, жим, тяга — 3 раза в неделю");
  const crumbList = JSON.parse(blocks.find((b) => b.includes("BreadcrumbList"))!) as { itemListElement: { name: string }[] }[] | { itemListElement: { name: string }[] };
  const items = (Array.isArray(crumbList) ? crumbList.find((d) => d.itemListElement) : crumbList)!.itemListElement;
  await expect(page.getByRole("navigation", { name: "Хлебные крошки" }).locator('[aria-current="page"]')).toHaveText(items.at(-1)!.name);

  const table = page.getByRole("table").first();
  await expect(table.getByText("Приседания со штангой")).toBeVisible();
  await expect(table.getByText("5 × 5").first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Начать программу" }).first()).toHaveAttribute("href", "/training-programs/5x5/start");
});

test("неизвестная программа — 404", async ({ page }) => {
  const res = await page.goto("/training-programs/nope");
  expect(res?.status()).toBe(404);
});

const workoutCount = (login: string) =>
  withDb(async (db) => Number((await db.query<{ n: string }>(`select count(*) as n from "Workout" where "userId" = $1`, [await userId(db, login)])).rows[0].n));

test("гость: «Начать программу» → регистрация → первый день в редакторе", async ({ page }) => {
  test.slow();
  await page.goto("/training-programs/beginner");
  await page.getByRole("link", { name: "Начать программу" }).first().click();
  await expect(page).toHaveURL(/\/register\?next=%2Ftraining-programs%2Fbeginner%2Fstart$/);
  const login = uniqueLogin();
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Email").fill(`${login}@test.local`);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Повторите пароль").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ }).click();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/training$/, { timeout: 15_000 });
  for (const name of ["Приседания со штангой", "Жим штанги лёжа", "Тяга верхнего блока", "Скручивания"]) {
    await expect(page.getByRole("region", { name }).first()).toBeVisible();
  }
  expect(await workoutCount(login)).toBe(1);
});

test("вошедший без тренировки: старт программы открывает первый день", async ({ page }) => {
  const { login } = await registerUser(page);
  // RSC-запрос (префетч, redirect из server action) ничего не создаёт — работает только обычный переход
  const rsc = await page.request.get("/training-programs/upper-lower/start", { headers: { rsc: "1" } });
  expect(rsc.status()).toBe(204);
  expect(await workoutCount(login)).toBe(0);
  await page.goto("/training-programs/upper-lower/start");
  await expect(page).toHaveURL(/\/training$/);
  for (const name of ["Жим штанги лёжа", "Разгибание рук на блоке"]) {
    await expect(page.getByRole("region", { name }).first()).toBeVisible();
  }
  expect(await workoutCount(login)).toBe(1);
});

test("при идущей тренировке старт программы не создаёт новую", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await expect.poll(() => workoutCount(login)).toBe(1);
  await page.goto("/training-programs/5x5/start");
  await expect(page).toHaveURL(/\/training$/);
  expect(await workoutCount(login)).toBe(1);
});

test("старт неизвестной программы — 404", async ({ page }) => {
  const res = await page.goto("/training-programs/nope/start");
  expect(res?.status()).toBe(404);
});

test("калькулятор DOTS/Wilks без входа: мета, расчёт по трём лифтам и по сумме", async ({ page }) => {
  await page.goto("/tools/dots-wilks");
  await expect(page).toHaveURL(/\/tools\/dots-wilks$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Калькулятор DOTS и Wilks");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/tools\/dots-wilks$/);

  const calc = page.getByRole("region", { name: "Калькулятор DOTS и Wilks" });
  const result = calc.getByTestId("strength-result");
  await expect(result).toHaveCount(0);
  await calc.getByRole("radio", { name: "Мужчина" }).check({ force: true });
  await calc.getByLabel("Вес тела, кг").fill("100");
  await calc.getByLabel("Присед, кг").fill("220");
  await calc.getByLabel("Жим лёжа, кг").fill("150");
  await calc.getByLabel("Становая, кг").fill("230");
  await expect(result).toContainText("Сумма 600 кг");
  await expect(result).toContainText("DOTS 369,31");
  await expect(result).toContainText("Wilks 365,15");
  await expect(result).toContainText("Продвинутый");
  await expect(result).toContainText("Шкала уровней ориентировочная");

  await calc.getByRole("radio", { name: "Женщина" }).check({ force: true });
  await calc.getByRole("switch", { name: "Только сумма" }).click();
  await calc.getByLabel("Вес тела, кг").fill("70");
  await calc.getByLabel("Сумма, кг").fill("400");
  await expect(result).toContainText("DOTS 404,50");
  await expect(result).toContainText("Мастер");

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.join("")).toContain("BreadcrumbList");
});

test("sitemap и перекрёстные ссылки ведут на калькулятор DOTS/Wilks", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/tools/dots-wilks</loc>");
  await page.goto("/tools/1rm");
  await expect(page.locator('main a[href="/tools/dots-wilks"]').first()).toBeVisible();
  await page.goto("/training-programs");
  await expect(page.locator('main a[href="/tools/dots-wilks"]')).toBeVisible();
});
