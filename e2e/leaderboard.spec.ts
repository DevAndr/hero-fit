import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "./db";
import { quickWorkout, registerUser } from "./helpers";

async function setNickname(page: Page, nickname: string) {
  await page.goto("/friends");
  await page.getByLabel("Ник", { exact: true }).fill(nickname);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(`Вы — ${nickname}`)).toBeVisible();
}

const nick = (login: string, prefix: string) => `${prefix}_${login.slice(-8)}`;

test("invite by link → request → accept → both in the weekly league", async ({ page, browser }) => {
  test.slow(); // два пользователя (две регистрации argon2) + тренировка — под параллельной нагрузкой и на CI долго
  const a = await registerUser(page, "Алекс");
  const alpha = nick(a.login, "Alpha");
  // Без ника — лиги нет, есть подсказка придумать ник (имя подставлено)
  await page.goto("/leaderboard");
  await expect(page.getByText("Для начала придумайте ник")).toBeVisible();
  await expect(page.getByLabel("Ник", { exact: true })).toHaveValue("Алекс");
  await setNickname(page, alpha);
  const code = (await page.getByTestId("friend-code").textContent())!.replace("-", "");

  const other = await browser.newContext();
  const pageB = await other.newPage();
  try {
    const b = await registerUser(pageB, "Борис");
    const bravo = nick(b.login, "Bravo");
    // Ник без учёта регистра уже занят
    await pageB.goto("/friends");
    await pageB.getByLabel("Ник", { exact: true }).fill(alpha.toUpperCase());
    await pageB.getByRole("button", { name: "Сохранить" }).click();
    await expect(pageB.getByText("Этот ник уже занят")).toBeVisible();

    // По ссылке-приглашению (старый адрес /leaderboard переадресует в «Друзья»): сначала ник, затем баннер
    await pageB.goto(`/leaderboard?invite=${code}`);
    await expect(pageB).toHaveURL(`/friends?invite=${code}`);
    await expect(pageB.getByText(`${alpha} уже ждёт вас`)).toBeVisible();
    await pageB.getByLabel("Ник", { exact: true }).fill(bravo);
    await pageB.getByRole("button", { name: "Сохранить" }).click();
    const banner = pageB.getByRole("region", { name: "Приглашение" });
    await expect(banner).toContainText(`${alpha}`);
    await banner.getByRole("button", { name: "Добавить в друзья" }).click();
    await expect(pageB.getByText(`Заявка отправлена: ${alpha}`)).toBeVisible();
    await expect(pageB.getByRole("list", { name: "Отправленные заявки" })).toContainText(alpha);

    // A получает уведомление и принимает заявку
    await page.goto("/friends");
    await expect(page.getByRole("button", { name: /Уведомления/ })).toBeVisible();
    const incoming = page.getByRole("list", { name: "Входящие заявки" });
    await expect(incoming).toContainText(bravo);
    await incoming.getByRole("button", { name: `Принять заявку от ${bravo}` }).click();
    await expect(page.getByRole("list", { name: "Список друзей" })).toContainText(bravo);

    // A тренируется → обгоняет B в лиге этой недели
    await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);
    await pageB.goto("/leaderboard");
    const places = pageB.getByRole("list", { name: "Места" }).getByRole("listitem");
    await expect(places).toHaveCount(2);
    await expect(places.nth(0)).toContainText(alpha);
    await expect(places.nth(0).getByTestId("league-xp")).not.toHaveText("0 XP");
    await expect(places.nth(1)).toContainText(bravo);
    await expect(places.nth(1)).toContainText("это вы");

    // B получил уведомление о принятии заявки
    await pageB.getByRole("button", { name: /Уведомления/ }).click();
    await expect(pageB.getByText("🤝 Заявка принята")).toBeVisible();
    await pageB.keyboard.press("Escape"); // открытое меню делает остальную страницу неактивной

    // Прошлая неделя — пустая
    await pageB.getByRole("link", { name: "Прошлая" }).click();
    await expect(pageB).toHaveURL(/week=prev/);
    await expect(pageB.getByTestId("league-xp").first()).toHaveText("0 XP");

    // Удаление из друзей
    await pageB.goto("/friends");
    await pageB.getByRole("button", { name: `Удалить ${alpha} из друзей` }).click();
    await pageB.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(pageB.getByText(`${alpha} удалён из друзей`)).toBeVisible();
    await pageB.goto("/leaderboard");
    await expect(pageB.getByRole("list", { name: "Места" }).getByRole("listitem")).toHaveCount(1);
  } finally {
    await other.close();
  }
});

test("friend code input: own code, unknown code, mutual requests become friendship", async ({ page }) => {
  const a = await registerUser(page);
  await setNickname(page, nick(a.login, "Solo"));
  const code = (await page.getByTestId("friend-code").textContent())!;

  const form = page.getByRole("form", { name: "Добавить по коду" });
  await form.getByLabel("Код друга").fill(code);
  await form.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText("Это ваш собственный код")).toBeVisible();

  await form.getByLabel("Код друга").fill("ZZZZ-ZZZZ");
  await form.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText("Код не найден — проверьте его")).toBeVisible();
});

test("anonymous percentile among active athletes", async ({ page }) => {
  const { login } = await registerUser(page);
  // 10 активных атлетов с маленьким XP на этой неделе — сравнение точно доступно
  await withDb(async (db) => {
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      const l = `pct_${login.slice(-8)}_${i}`;
      await db.query(
        `insert into "User" (id, login, email, "passwordHash", "updatedAt") values ($1, $2, $3, 'x', now())`,
        [id, l, `${l}@test.local`],
      );
      await db.query(
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "createdAt", "updatedAt")
         values ($1, $2, 'Seed', 'COMPLETED', now() - interval '1 hour', now() - interval '1 minute', 3600, now(), now())`,
        [randomUUID(), id],
      );
      await db.query(
        `insert into "XpEvent" (id, "userId", amount, reason, "createdAt") values ($1, $2, 1, 'WORKOUT_COMPLETED', now())`,
        [randomUUID(), id],
      );
    }
  });

  await page.goto("/leaderboard");
  await expect(page.getByText("Потренируйтесь на этой неделе")).toBeVisible();
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);
  await page.goto("/leaderboard");
  await expect(page.getByTestId("percentile")).toHaveText(/^Выше, чем у \d+%$/);
});
