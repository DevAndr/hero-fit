import { expect, test } from "@playwright/test";
import { backdateUser, clearCohort, E2E_ADMIN, makeAdmin, seedWorkouts, setTimeZone, visitDays } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ, E2E_TZ_OFFSET } from "./tz";

// makeAdmin переименовывает глобального админа — сценарии по очереди и только на desktop
test.describe.configure({ mode: "serial" });

test("a visit writes one day to the visit log", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/dashboard");
  await page.reload();
  await expect.poll(() => visitDays({ login: me.login })).toHaveLength(1);
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
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Метрики", level: 1 })).toBeVisible();
    const tiles = page.getByRole("region", { name: "Сводка" });
    await expect(tiles.getByText("Пользователей")).toBeVisible();
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

  // Только этот сценарий сдвигает регистрацию в прошлое; следы прошлых прогонов в когорте 5 недель назад убирает clearCohort.
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
