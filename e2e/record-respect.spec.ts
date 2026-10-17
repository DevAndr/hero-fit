import { expect, test } from "@playwright/test";
import { makeFriends, notificationTitles, notificationUrls, respectCount, seedRecordWorkout, seedRespects, setPrivacy, withDb } from "./db";
import { registerUser } from "./helpers";
import { twoInGuild } from "./guild-helpers";

const BENCH = "Жим штанги лёжа";
const SQUAT = "Приседания со штангой";

const nick = (prefix: string, login: string) => `${prefix}_${login.slice(-8)}`;

async function notificationBodies(login: string, title: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ body: string }>(
      `select n.body from "Notification" n join "User" u on u.id = n."userId" where u.login = $1 and n.title = $2`,
      [login, title],
    );
    return rows.map((r) => r.body);
  });
}

test("a friend gives respect to a record; the author is notified once; removing decreases", async ({ page, browser }) => {
  test.slow(); // три регистрации (argon2)
  const author = await registerUser(page, "Автор");
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();
  try {
    const f1 = await registerUser(page1, "Первый");
    const f2 = await registerUser(page2, "Второй");
    const a = nick("Alpha", author.login);
    const n1 = nick("Bravo", f1.login);
    const n2 = nick("Charlie", f2.login);
    await makeFriends(author.login, a, f1.login, n1);
    await makeFriends(author.login, a, f2.login, n2);
    const { workoutId, exerciseIds } = await seedRecordWorkout(author.login, [
      { exercise: BENCH, value: 100 },
      { exercise: SQUAT, value: 120 },
    ]);

    await page1.goto("/friends");
    const card = page1.getByRole("article", { name: `${a}: Рекордная` });
    await card.getByRole("button", { name: `Дать респект ${a} за ${BENCH}` }).dblclick({ delay: 20 }); // двойной клик не ставит и снимает
    const pressed = card.getByRole("button", { name: `Убрать респект у ${a} за ${BENCH}` });
    await expect(pressed).toHaveAttribute("aria-pressed", "true");
    await expect(pressed).toHaveText("1");
    await expect.poll(() => respectCount(workoutId, exerciseIds[BENCH])).toBe(1);
    const title = `🏆 Респект за рекорд: ${BENCH}`;
    await expect.poll(() => notificationBodies(author.login, title)).toEqual([n1]);
    // у приседа счётчик пуст
    await expect(card.getByRole("button", { name: `Дать респект ${a} за ${SQUAT}` })).toHaveText("");

    // Второй друг — то же уведомление (одно), ники: последний поставивший первым
    await page2.goto("/friends");
    await page2.getByRole("article", { name: `${a}: Рекордная` }).getByRole("button", { name: `Дать респект ${a} за ${BENCH}` }).click();
    await expect.poll(() => notificationBodies(author.login, title)).toEqual([`${n2}, ${n1}`]);
    expect((await notificationTitles(author.login)).filter((t) => t === title)).toHaveLength(1);

    // Второй снимает (после перезагрузки: пока запрос в полёте, повторные клики кнопка игнорирует) → у первого остаётся его респект
    await page2.reload();
    await page2.getByRole("article", { name: `${a}: Рекордная` }).getByRole("button", { name: `Убрать респект у ${a} за ${BENCH}` }).click();
    await expect.poll(() => respectCount(workoutId, exerciseIds[BENCH])).toBe(1);

    // Первый снимает свой → 0, счётчик пуст
    await card.getByRole("button", { name: `Убрать респект у ${a} за ${BENCH}` }).click();
    await expect(card.getByRole("button", { name: `Дать респект ${a} за ${BENCH}` })).toHaveText("");
    await expect.poll(() => respectCount(workoutId, exerciseIds[BENCH])).toBe(0);
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

test("own record has no button; a workout without records has none; hidden weights keep the button", async ({ page, browser }) => {
  test.slow();
  const author = await registerUser(page, "Автор");
  const ctx = await browser.newContext();
  const pageF = await ctx.newPage();
  try {
    const friend = await registerUser(pageF, "Друг");
    const a = nick("Alpha", author.login);
    await makeFriends(author.login, a, friend.login, nick("Bravo", friend.login));
    const { workoutId, exerciseIds } = await seedRecordWorkout(author.login, [{ exercise: BENCH, value: 100 }], { name: "С рекордом" });
    await seedRecordWorkout(author.login, [], { name: "Без рекордов" });
    await seedRespects(workoutId, exerciseIds[BENCH], 2);

    // Автор: свой рекорд — без кнопки, но с числом
    await page.goto("/friends");
    const own = page.getByRole("article", { name: `${a}: С рекордом` });
    await expect(own).toContainText(`${BENCH}: макс. вес 100 кг`);
    await expect(own.getByRole("button", { name: /респект/ })).toHaveCount(0);
    await expect(own.getByTitle(/^fan\d_\w+ и fan\d_\w+$/)).toContainText("Респектов: 2");

    // Друг: кнопка и счётчик 2; запись без рекордов — без кнопок
    await pageF.goto("/friends");
    const card = pageF.getByRole("article", { name: `${a}: С рекордом` });
    await expect(card.getByRole("button", { name: `Дать респект ${a} за ${BENCH}` })).toHaveText("2");
    await expect(pageF.getByRole("article", { name: `${a}: Без рекордов` })).toBeVisible();
    await expect(pageF.getByRole("article", { name: `${a}: Без рекордов` }).getByRole("button", { name: /респект/ })).toHaveCount(0);

    // Дашборд: «Друзья недавно» — рекорды без кнопок респекта (вне цикла)
    await pageF.goto("/dashboard");
    const recent = pageF.getByRole("region", { name: "Друзья недавно" });
    await expect(recent.getByRole("article").first()).toBeVisible();
    await expect(recent.getByRole("button", { name: /респект/ })).toHaveCount(0);

    // Скрытые веса: значения не показаны, кнопка есть
    await setPrivacy(author.login, { hideWeights: true });
    await pageF.goto("/friends");
    await expect(card).toContainText(`${BENCH}: макс. вес`);
    await expect(card).not.toContainText("100 кг");
    await expect(card.getByRole("button", { name: `Дать респект ${a} за ${BENCH}` })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("a guild mate (not a friend) gives respect in /guild", async ({ browser }) => {
  test.slow();
  const { a, b } = await twoInGuild(browser);
  try {
    const nickA = await withDb(async (db) => (await db.query<{ nickname: string }>(`select nickname from "User" where login = $1`, [a.login])).rows[0].nickname);
    const { workoutId, exerciseIds } = await seedRecordWorkout(a.login, [{ exercise: BENCH, value: 100 }]);
    await b.page.goto("/guild");
    const card = b.page.getByRole("article", { name: `${nickA}: Рекордная` });
    await card.getByRole("button", { name: `Дать респект ${nickA} за ${BENCH}` }).click();
    await expect(card.getByRole("button", { name: `Убрать респект у ${nickA} за ${BENCH}` })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => respectCount(workoutId, exerciseIds[BENCH])).toBe(1);
    await expect.poll(async () => (await notificationUrls(a.login)).includes(`/guild#w-${workoutId}`)).toBe(true);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("mobile: no horizontal scroll with a long exercise name", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "только мобильный проект");
  test.slow();
  const author = await registerUser(page, "Автор");
  const ctx = await browser.newContext(testInfo.project.use);
  const pageF = await ctx.newPage();
  try {
    const friend = await registerUser(pageF, "Друг");
    const a = nick("Alpha", author.login);
    await makeFriends(author.login, a, friend.login, nick("Bravo", friend.login));
    const long = `Очень_длинное_название_упражнения_без_пробелов_${"Ы".repeat(40)}`;
    await seedRecordWorkout(author.login, [
      { exercise: long, value: 100 },
      { exercise: BENCH, value: 90 },
    ]);
    await pageF.goto("/friends");
    await expect(pageF.getByRole("button", { name: `Дать респект ${a} за ${long}` })).toBeVisible();
    const overflow = await pageF.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  } finally {
    await ctx.close();
  }
});
