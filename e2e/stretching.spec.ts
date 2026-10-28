import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, makeFriends } from "./db";
import { addToWorkout, registerUser } from "./helpers";

const STRETCH = "Кошка-корова";
const LIFT = "Жим штанги лёжа";

/** Отметить первый подход растяжки: время удержания вручную и ✓. */
async function holdDone(page: Page, exercise: string, time: string) {
  const block = page.getByRole("region", { name: exercise });
  await block.getByLabel("Время, подход 1").fill(time);
  await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

test("stretch session does not count toward the week, a lift with a cool-down does", async ({ page, browser }) => {
  test.slow(); // две регистрации (argon2) и две тренировки
  const a = await registerUser(page, "Гибкий");
  await addFlagUser("stretching", a.login);
  const other = await browser.newContext();
  const pageB = await other.newPage();
  try {
    const b = await registerUser(pageB, "Друг");
    const alpha = `Flex_${a.login.slice(-8)}`;
    await makeFriends(a.login, alpha, b.login, `Pal_${b.login.slice(-8)}`);

    // Сессия из одной растяжки: неделя серии не двигается
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await addToWorkout(page, [STRETCH]);
    await holdDone(page, STRETCH, "1:30");
    await finish(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("streak-week")).toHaveText("0/3 за неделю");

    // В ленте друга — «Растяжка · 1 мин» без объёма
    await pageB.goto("/friends");
    const card = pageB.getByRole("article", { name: new RegExp(`^${alpha}: `) });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("feed-stretch")).toHaveText("Растяжка · 1 мин");
    await expect(card.getByTestId("feed-volume")).toHaveCount(0);

    // Силовая с заминкой — обычная тренировка: +1 к неделе (сессия растяжки в счёт не идёт)
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await addToWorkout(page, [LIFT, STRETCH]);
    const lift = page.getByRole("region", { name: LIFT });
    await lift.getByLabel("Вес, подход 1").fill("40");
    await lift.getByLabel("Повторы, подход 1").fill("10");
    await lift.getByRole("button", { name: "Подход 1 выполнен" }).click();
    await holdDone(page, STRETCH, "45");
    await finish(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("streak-week")).toHaveText("1/3 за неделю");
  } finally {
    await other.close();
  }
});
