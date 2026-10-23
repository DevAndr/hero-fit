import { expect, test } from "@playwright/test";
import { addLandingVisit, backdateUser, clearCohort, landingUtmVisits, createUserRow, E2E_ADMIN, enableCoach, makeAdmin, seedWorkouts, setSignupSource, setSignupUtm, setTimeZone, visitDays, visitHours } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ, E2E_TZ_OFFSET, localAt } from "./tz";

// makeAdmin переименовывает глобального админа — сценарии по очереди и только на desktop
test.describe.configure({ mode: "serial" });

test("a visit writes one day to the visit log", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/dashboard");
  await page.reload();
  await expect.poll(() => visitDays({ login: me.login })).toHaveLength(1);
});

test("visits within one hour write one hour to the hour log, in the user's local time", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/dashboard");
  await page.reload();
  await page.goto("/stats");
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .format(new Date())
    .replace(", ", " ");
  // Прогон стартует в 12:xx — граница часа между проверками маловероятна, но возможна: тогда записей две
  await expect.poll(() => visitHours(me.login)).toContain(now);
  expect((await visitHours(me.login)).length).toBeLessThanOrEqual(2);
});

test.describe("admin metrics page", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "desktop", "Админ один на прогон");
  });

  test("non-admin gets 404", async ({ page }) => {
    await registerUser(page);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
  });

  test("admin sees tiles, charts, cohorts and features; range switches to 90 days", async ({ page }) => {
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await enableCoach(E2E_ADMIN, `adm${Date.now().toString(36)}`);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Метрики", level: 1 })).toBeVisible();
    const tiles = page.getByRole("region", { name: "Сводка" });
    await expect(tiles.getByText("Пользователей")).toBeVisible();
    // Тренеры и обычные — из того же снимка, что и общее число
    const users = tiles.locator("div").filter({ has: page.getByText("Пользователей", { exact: true }) }).last();
    const count = async (label: string) => Number((await users.getByText(`${label}:`).locator("..").innerText()).replace(/\D/g, ""));
    const total = Number((await users.locator("p.text-2xl").innerText()).replace(/\D/g, ""));
    expect((await count("Тренеры")) + (await count("Обычные"))).toBe(total);
    expect(await count("Тренеры")).toBeGreaterThanOrEqual(1);
    await expect(tiles.getByText("Активные", { exact: true })).toBeVisible();
    for (const name of ["Регистрации", "Активные", "Тренировки"]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    }
    const cohorts = page.getByRole("table", { name: "Удержание по неделям регистрации" });
    await expect(cohorts).toBeVisible();
    await expect(cohorts.getByRole("row")).toHaveCount(9);
    await expect(page.getByRole("region", { name: "Фичи" }).getByText("Прошли экскурсию")).toBeVisible();

    await page.getByRole("link", { name: "90 дней" }).click();
    await expect(page).toHaveURL(/\/admin\?range=90$/);
    await expect(page.getByRole("link", { name: "90 дней" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/за 90 дней$/).first()).toBeVisible();
  });

  test("time of day chart: 24 hours, the admin's own visit is in the current local hour", async ({ page }) => {
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin");
    const card = page.getByRole("region", { name: "Время суток" });
    await expect(card.getByRole("heading", { name: "Время суток", level: 2 })).toBeVisible();
    const table = card.getByRole("table", { name: "Активность по часам за 30 дней" });
    await expect(table.getByRole("row")).toHaveCount(25);
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone: E2E_TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date());
    const row = table.getByRole("row").filter({ has: page.getByRole("cell", { name: `${hour}:00`, exact: true }) });
    await expect(row.getByRole("cell").nth(1)).not.toHaveText("0");
  });

  test("signup sources: landing rows with nested referrers", async ({ page, browser }) => {
    for (const [landing, referrer] of [
      ["program", "search"],
      ["tool", "social"],
    ] as const) {
      const ctx = await browser.newContext();
      const user = await registerUser(await ctx.newPage());
      await ctx.close();
      await setSignupSource(user.login, landing, referrer);
    }
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin");
    const table = page.getByRole("table", { name: "Источники регистраций за 30 дней" });
    await expect(table).toBeVisible();
    for (const name of ["Программы", "Калькуляторы", "Поиск", "Соцсети"]) {
      await expect(table.getByRole("rowheader", { name, exact: true }).first()).toBeVisible();
    }
    await expect(table.getByRole("columnheader", { name: "Активны на 2-й неделе, %" })).toBeVisible();
  });

  test("signup sources: counts of first workout and week 2 activity", async ({ page }) => {
    const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
    const reg = addDays(today, -20);
    // Своя страница входа на прогон: строка группы считается только по игрокам этого сценария
    const tag = `e2e-${Date.now().toString(36)}`;
    const login = (s: string) => `src_${tag.slice(4)}_${s}`;
    for (const s of ["a", "b", "c", "d"]) {
      await createUserRow(login(s));
      await setSignupSource(login(s), tag, "search");
    }
    // A — свежая регистрация (ещё не eligible) с тренировкой
    await seedWorkouts(login("a"), "Жим штанги лёжа", [{ weight: 50, reps: 5, sets: 1 }], 1, { finishedAt: [new Date()] });
    // B — заход в день 7; C — заходы в дни 6 и 14 (вне окна)
    await backdateUser(login("b"), { createdAt: localAt(reg, "12:00"), timeZone: E2E_TZ, visitDays: [addDays(reg, 7)] });
    await backdateUser(login("c"), { createdAt: localAt(reg, "12:00"), timeZone: E2E_TZ, visitDays: [addDays(reg, 6), addDays(reg, 14)] });
    // D — пояс далеко от админа; регистрация в день reg и по UTC, и в поясе игрока, а тренировка в местный день игрока
    // reg+7 (восток) / reg+13 (запад) — в окне, по UTC — reg+6 / reg+14, вне окна
    const east = E2E_TZ_OFFSET < 0;
    const finishedAt = east ? new Date(`${addDays(reg, 7)}T00:30:00+14:00`) : new Date(`${addDays(reg, 13)}T23:00:00-12:00`);
    await seedWorkouts(login("d"), "Жим штанги лёжа", [{ weight: 50, reps: 5, sets: 1 }], 1, { finishedAt: [finishedAt] });
    await backdateUser(login("d"), {
      createdAt: east ? new Date(`${reg}T20:00:00+14:00`) : new Date(`${reg}T06:00:00-12:00`),
      timeZone: east ? "Etc/GMT-14" : "Etc/GMT+12",
      visitDays: [],
    });

    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await setTimeZone(E2E_ADMIN);
    await page.goto("/admin");
    const table = page.getByRole("table", { name: "Источники регистраций за 30 дней" });
    const cells = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: tag, exact: true }) }).getByRole("cell");
    // ячейки: регистраций, первая тренировка, активны на 2-й неделе (B и D из трёх eligible), посетители и конверсия (заходов по метке нет)
    await expect(cells).toHaveText(["4", "50 %", "67 %", "—", "—"]);
  });

  test("signup campaigns: utm_source rows with nested campaigns", async ({ page, browser }) => {
    // Свой utm_source и кампания на прогон: строки — только по игрокам этого сценария
    const tag = `e2e-${Date.now().toString(36)}`;
    for (const campaign of [`${tag}-c`, `${tag}-c`, null]) {
      const ctx = await browser.newContext();
      const user = await registerUser(await ctx.newPage());
      await ctx.close();
      await setSignupUtm(user.login, tag, campaign);
    }
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin");
    const table = page.getByRole("table", { name: "Рекламные метки за 30 дней" });
    const group = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: tag, exact: true }) });
    await expect(group.getByRole("cell").first()).toHaveText("3");
    // вложенные строки идут за строкой группы по убыванию регистраций
    const child = (n: number) => group.locator(`xpath=following-sibling::tr[${n}]`);
    await expect(child(1).getByRole("rowheader")).toHaveText(`${tag}-c`);
    await expect(child(1).getByRole("cell").first()).toHaveText("2");
    await expect(child(2).getByRole("rowheader")).toHaveText("без кампании");
    await expect(child(2).getByRole("cell").first()).toHaveText("1");
  });

  test("utm clicks and conversion in signup campaigns", async ({ page, browser }) => {
    const tag = `e2e-v-${Date.now().toString(36)}`;
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(`/?utm_source=${tag}&utm_campaign=${tag}-c`);
    await expect.poll(() => landingUtmVisits(tag)).toBe(1);
    await registerUser(guestPage);
    await guest.close();

    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin");
    const table = page.getByRole("table", { name: "Рекламные метки за 30 дней" });
    await expect(table.getByRole("columnheader", { name: "Переходы" })).toBeVisible();
    const cells = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: tag, exact: true }) }).getByRole("cell");
    // регистраций, первая тренировка, активны на 2-й неделе, переходы, конверсия
    await expect(cells).toHaveText(["1", "0 %", "—", "1", "100 %"]);
    await expect(page.getByRole("heading", { name: "Новые посетители" })).toBeVisible();
  });

  test("new visitors fall on the admin's local day", async ({ page }) => {
    // Час у края местных суток: к востоку от UTC — полночь, к западу — 23:00; ошибка пояса уводит его во вчера или завтра
    // Сегодняшние посетители растут и от соседних тестов (каждый гость в e2e считается) — сравниваем дельту
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await setTimeZone(E2E_ADMIN);
    await page.goto("/admin");
    const table = page.getByRole("table", { name: "Новые посетители по дням за 30 дней" });
    const label = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`));
    const cell = table.getByRole("row").filter({ has: page.getByRole("cell", { name: label, exact: true }) }).getByRole("cell").nth(1);
    const before = Number(await cell.textContent());
    await addLandingVisit(localAt(today, E2E_TZ_OFFSET > 0 ? "00:00" : "23:00"), "e2e", "e2e", 500);
    await page.reload();
    expect(Number(await cell.textContent())).toBeGreaterThanOrEqual(before + 500);
  });

  // Регистрацию в прошлое сдвигают этот сценарий (когорта 5 недель назад; следы прошлых прогонов убирает clearCohort)
  // и сценарий значений источников (20 дней назад — другая когорта).
  test("visit and workout on the same local day count once, in the player's own day", async ({ page, browser }) => {
    const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
    const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const cohort = addDays(monday, -35);

    // Пояс игрока на 12+ ч от пояса админа: заход и тренировка в один местный день игрока,
    // но у админа тренировка на другой стороне границы недель.
    const east = E2E_TZ_OFFSET < 0;
    const day = east ? addDays(cohort, 14) : addDays(cohort, 13); // пн недели 2 или вс недели 1
    const finishedAt = east ? new Date(`${day}T00:30:00+14:00`) : new Date(`${day}T23:00:00-12:00`);
    const playerCtx = await browser.newContext();
    const player = await registerUser(await playerCtx.newPage());
    await playerCtx.close();
    // Неделя когорты с запасом в сутки по краям — граница недели у админа в его поясе
    await clearCohort(new Date(`${addDays(cohort, -1)}T00:00:00Z`), new Date(`${addDays(cohort, 8)}T00:00:00Z`));
    await seedWorkouts(player.login, "Жим штанги лёжа", [{ weight: 50, reps: 5, sets: 1 }], 1, { finishedAt: [finishedAt] });
    await backdateUser(player.login, {
      createdAt: new Date(`${addDays(cohort, 2)}T12:00:00Z`),
      timeZone: east ? "Etc/GMT-14" : "Etc/GMT+12",
      visitDays: [day],
    });

    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await setTimeZone(E2E_ADMIN);
    await page.goto("/admin");
    const label = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${cohort}T12:00:00Z`));
    const row = page.getByRole("table", { name: "Удержание по неделям регистрации" }).getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
    const cells = row.getByRole("cell");
    // ячейки: «Новых», затем недели 0…6
    await expect(cells.nth(east ? 3 : 2)).toHaveText("100 %");
    await expect(cells.nth(east ? 2 : 3)).toHaveText("0 %");
  });
});
