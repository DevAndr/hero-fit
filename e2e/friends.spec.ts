import { expect, test } from "@playwright/test";
import { makeFriends, userId, withDb } from "./db";
import { quickWorkout, registerUser } from "./helpers";

test("activity feed: friend's workout, kudos with grouped notification, hidden weights, hidden activity", async ({
  page,
  browser,
}) => {
  test.slow(); // два пользователя (две регистрации argon2) + тренировка — под параллельной нагрузкой и на CI долго
  const a = await registerUser(page, "Алекс");
  const other = await browser.newContext();
  const pageB = await other.newPage();
  try {
    const b = await registerUser(pageB, "Борис");
    const alpha = `Alpha_${a.login.slice(-8)}`;
    const bravo = `Bravo_${b.login.slice(-8)}`;
    await makeFriends(a.login, alpha, b.login, bravo);

    // A тренируется: первый жим → в ленте у B длительность, объём, упражнение с весом
    await quickWorkout(page, "Жим штанги лёжа", [{ weight: "100", reps: "5" }]);
    await pageB.goto("/friends");
    const card = pageB.getByRole("article", { name: `${alpha}: Тренировка` });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("feed-volume")).toHaveText("500 кг");
    await expect(card.getByTestId("feed-exercises")).toHaveText("Жим штанги лёжа 100 кг");
    await expect(card).toContainText("Клуб сотки: жим лёжа"); // ачивка из этой тренировки

    // 👊 — автор получает уведомление
    await card.getByRole("button", { name: `Дать 👊 ${alpha}` }).click();
    await expect(card.getByRole("button", { name: `Убрать 👊 у ${alpha}` })).toHaveAttribute("aria-pressed", "true");
    await expect(card).toContainText("Вы");
    // Кнопка обновляется оптимистично — ждём, пока сервер дойдёт до уведомления
    await expect
      .poll(() =>
        withDb(async (db) => {
          const id = await userId(db, a.login);
          const { rows } = await db.query(`select count(*)::int c from "Notification" where "userId" = $1 and url like '/friends#w-%'`, [id]);
          return rows[0].c;
        }),
      )
      .toBe(1);
    await page.goto("/friends");
    await expect(page.getByRole("article", { name: `${alpha}: Тренировка` })).toContainText(bravo);
    await page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(page.getByText("👊 Тренировка «Тренировка»")).toBeVisible();
    await expect(page.getByText(`Поддержали: ${bravo}`)).toBeVisible();
    await page.keyboard.press("Escape");

    // Дашборд B: «Друзья недавно»
    await pageB.goto("/dashboard");
    await expect(pageB.getByRole("region", { name: "Друзья недавно" }).getByRole("article")).toHaveCount(1);

    // A скрывает веса → у B нет объёма и весов, длительность и подходы остались
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Скрывать рабочие веса" }).click();
    await expect(page.getByRole("switch", { name: "Скрывать рабочие веса" })).toBeChecked();
    await pageB.goto("/friends");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("feed-volume")).toHaveCount(0);
    await expect(card.getByTestId("feed-exercises")).toHaveText("Жим штанги лёжа");
    await expect(card).toContainText("подходов: 1");
    // В браузер скрытые числа не уходят вообще
    expect(await pageB.content()).not.toContain("500 кг");

    // A выключает показ активности → тренировка исчезает у B (и прошлая тоже)
    await page.getByRole("switch", { name: "Показывать мои тренировки друзьям" }).click();
    await expect(page.getByRole("switch", { name: "Показывать мои тренировки друзьям" })).not.toBeChecked();
    await pageB.goto("/friends");
    await expect(pageB.getByRole("article", { name: `${alpha}: Тренировка` })).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("feed pages with «show more»; own workouts are in the feed", async ({ page }) => {
  const { login } = await registerUser(page);
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`update "User" set nickname = $2, "nicknameKey" = lower($2) where id = $1`, [id, `Pager_${login.slice(-8)}`]);
    // 18 завершённых тренировок — больше одной страницы (15)
    for (let i = 0; i < 18; i++) {
      await db.query(
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
         values (gen_random_uuid(), $1, $2, 'COMPLETED', now() - make_interval(days => $3, hours => 1), now() - make_interval(days => $3), 3600, 1000, 3, 30, now(), now())`,
        [id, `Сессия ${i + 1}`, i],
      );
    }
  });
  await page.goto("/friends");
  const feed = page.getByRole("region", { name: "Лента активности" });
  await expect(feed.getByRole("article")).toHaveCount(15);
  await expect(feed.getByRole("article").first()).toContainText("Вы");
  await feed.getByRole("button", { name: "Показать ещё" }).click();
  await expect(feed.getByRole("article")).toHaveCount(18);
  await expect(feed.getByRole("button", { name: "Показать ещё" })).toHaveCount(0);
});
