import { expect, test, type Page } from "@playwright/test";
import { fillGuild, guildOf, notificationUrls, setNickname, setPrivacy } from "./db";
import { createGuild, guildName, inviteUrl, nickOf, player, twoInGuild } from "./guild-helpers";
import { quickWorkout, registerUser } from "./helpers";

const members = (page: Page) => page.getByRole("list", { name: "Участники гильдии" });

test("no nickname → nickname form first; create a guild", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/guild");
  await expect(page.getByRole("button", { name: "Создать гильдию" })).toHaveCount(0);
  // До гидратации поле перезапишется подсказкой — ждём, что значение удержалось
  const nick = page.getByRole("textbox", { name: "Ник" });
  await expect(async () => {
    await nick.fill(nickOf(login));
    await expect(nick).toHaveValue(nickOf(login), { timeout: 500 });
  }).toPass();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Ник сохранён")).toBeVisible();
  await createGuild(page, guildName(login));
  await expect(page.getByText("1/10")).toBeVisible();
  await expect(members(page)).toContainText("глава");
  expect(await guildOf(login)).toMatchObject({ leader: true });
});

test("join by link, leader is notified, leader manages", async ({ browser }) => {
  test.slow();
  const a = await player(browser, "Аня");
  const b = await player(browser, "Боря");
  try {
    const name = guildName(a.login);
    await createGuild(a.page, name);
    const url = await inviteUrl(a.page);

    await b.page.goto(url);
    await expect(b.page.getByRole("heading", { name: `Вступить в гильдию «${name}»?` })).toBeVisible();
    await b.page.getByRole("button", { name: "Вступить" }).click();
    await expect(b.page).toHaveURL(/\/guild$/);
    await expect(b.page.getByText("2/10")).toBeVisible();

    await a.page.goto("/dashboard");
    await a.page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(a.page.getByText("вступил(а) в гильдию")).toBeVisible();

    // Главенство — Боре; Боря исключает Аню
    await a.page.goto("/guild");
    await members(a.page).getByRole("listitem").filter({ hasText: nickOf(b.login, "Бо") }).getByRole("button", { name: "Сделать главой" }).click();
    await a.page.getByRole("alertdialog").getByRole("button", { name: "Сделать главой" }).click();
    await expect.poll(() => guildOf(b.login)).toMatchObject({ leader: true });

    await b.page.goto("/guild");
    await members(b.page).getByRole("listitem").filter({ hasText: nickOf(a.login, "Ан") }).getByRole("button", { name: "Исключить" }).click();
    await b.page.getByRole("alertdialog").getByRole("button", { name: "Исключить" }).click();
    await expect.poll(() => guildOf(a.login)).toBeNull();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("full guild, changed link, leader can't leave, last one deletes", async ({ browser }) => {
  test.slow();
  const a = await player(browser, "Аня");
  const c = await player(browser, "Вика");
  try {
    await createGuild(a.page, guildName(a.login));
    const url = await inviteUrl(a.page);
    await fillGuild((await guildOf(a.login))!.code, 10);

    await c.page.goto(url);
    await expect(c.page.getByText("В гильдии нет мест")).toBeVisible();
    await expect(c.page.getByRole("button", { name: "Вступить" })).toHaveCount(0);

    // Глава с участниками не выходит
    await a.page.goto("/guild");
    await a.page.getByRole("button", { name: "Выйти из гильдии" }).click();
    await expect(a.page.getByRole("alertdialog")).toContainText("Сначала передайте главенство");
    await a.page.keyboard.press("Escape");

    await a.page.getByRole("button", { name: "Сменить ссылку" }).click();
    await expect.poll(() => inviteUrl(a.page)).not.toBe(url);
    const res = await c.page.goto(url);
    expect(res?.status()).toBe(404);

    // Одиночная гильдия: выход удаляет её
    await createGuild(c.page, guildName(c.login), "Лапа");
    await c.page.getByRole("button", { name: "Выйти из гильдии" }).click();
    await c.page.getByRole("alertdialog").getByRole("button", { name: "Выйти" }).click();
    await expect(c.page.getByRole("button", { name: "Создать гильдию" })).toBeVisible();
    expect(await guildOf(c.login)).toBeNull();
  } finally {
    await a.context.close();
    await c.context.close();
  }
});


test("guild feed shows a mate's workout, hides weights, kudos", async ({ browser }) => {
  test.slow();
  const { a, b } = await twoInGuild(browser);
  try {
    await setPrivacy(b.login, { hideWeights: true });
    await quickWorkout(b.page, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);

    await a.page.goto("/guild");
    const feed = a.page.getByRole("region", { name: "Лента гильдии" });
    const card = feed.getByRole("article").filter({ hasText: nickOf(b.login, "Бо") });
    // «Скрыть веса» — как у друзей: ни объёма, ни веса в строке упражнения
    await expect(card.getByTestId("feed-exercises")).toHaveText("Жим штанги лёжа");
    await expect(card.getByTestId("feed-volume")).toHaveCount(0);
    expect(await a.page.content()).not.toContain("600 кг");
    await card.getByRole("button", { name: new RegExp(`^Дать 👊`) }).click();
    await expect(card.getByRole("button", { name: /^Убрать 👊/ })).toHaveAttribute("aria-pressed", "true");

    // Не друзья — ссылка уведомления ведёт в ленту гильдии
    await expect.poll(async () => (await notificationUrls(b.login)).some((u) => u?.startsWith("/guild#w-"))).toBe(true);

    // Не делится тренировками — в ленте гильдии их нет
    await setPrivacy(b.login, { shareActivity: false });
    await a.page.reload();
    await expect(a.page.getByRole("region", { name: "Лента гильдии" })).not.toContainText("Жим штанги лёжа");
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("dashboard guild card", async ({ page }) => {
  const { login } = await registerUser(page);
  const card = page.getByRole("region", { name: "Гильдия" });
  await expect(card).toContainText("Создайте гильдию или вступите по ссылке");
  await setNickname(login, nickOf(login));
  await createGuild(page, guildName(login));
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "40", reps: "10" }]);
  await page.goto("/dashboard");
  await expect(card).toContainText(guildName(login));
  await expect(card).toContainText("потренировались 1 из 1");
});
