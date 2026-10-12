import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, clubAdminLogin, clubOf, createClub, joinClub, seedXpWorkout, seedXpWorkouts, setClubStatus, setNickname, setPrivacy } from "./db";
import { registerUser } from "./helpers";

// Флаг clubs — списком на пользователя (addFlagUser): спеки идут параллельно. Модерация — e2e/clubs-moderation.spec.ts

const unique = () => Math.random().toString(36).slice(2, 7);

async function clubsUser(page: Page) {
  const me = await registerUser(page);
  await addFlagUser("clubs", me.login);
  return me;
}

test("no flag — no clubs", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Клуб", exact: true })).toHaveCount(0);
  const res = await page.goto("/clubs");
  expect(res?.status()).toBe(404);
});

test("search finds approved clubs only, literally", async ({ page }) => {
  const me = await clubsUser(page);
  const city = `Тестоград${unique()}`;
  await createClub(me.login, { city, name: "Сила 100%", address: "ул. Мира, 7" });
  await createClub(me.login, { city, name: "Сила скрытая", status: "HIDDEN" });
  await createClub(me.login, { city, name: "Сила 1000", address: "ул. Мира, 9" });

  await page.goto("/clubs");
  const search = page.getByRole("search", { name: "Поиск клуба" });
  await search.getByLabel("Город").fill(city);
  await search.getByRole("button", { name: "Найти" }).click();
  const results = page.getByRole("list", { name: "Клубы" });
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(results.getByText("Сила скрытая")).toHaveCount(0);

  await search.getByLabel("Название или адрес").fill("100%");
  await search.getByRole("button", { name: "Найти" }).click();
  await expect(results.getByRole("listitem")).toHaveCount(2); // «100» — и «Сила 100%», и «Сила 1000»

  await search.getByLabel("Город").fill(`Нетакого${unique()}`);
  await search.getByLabel("Название или адрес").fill("%");
  await search.getByRole("button", { name: "Найти" }).click();
  await expect(page.getByText("Ничего не нашлось")).toBeVisible();

  // «%» без города — не «все клубы»: после очистки текста искать нечего
  await search.getByLabel("Город").fill("");
  await search.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/q=%25/);
  await expect(page.getByRole("list", { name: "Клубы" })).toHaveCount(0);
});

test("application: consent checkbox, my clubs, pending limit, rejected reason", async ({ page }) => {
  const me = await clubsUser(page);
  await createClub(me.login, { status: "REJECTED", name: `Отклонённый ${unique()}`, rejectReason: "Нет такого зала" });
  const city = `Заявкоград${unique()}`;

  await page.goto("/clubs");
  await page.getByRole("link", { name: "Создать клуб" }).click();
  await expect(page).toHaveURL(/\/clubs\/new$/);
  const form = page.getByRole("form", { name: "Заявка на клуб" });
  await form.getByLabel("Название").fill("Железо");
  await form.getByLabel("Город").fill(city);
  await form.getByLabel("Адрес").fill("ул. Спортивная, 3");
  await form.getByLabel("Контакт зала").fill("+7 900 111-22-33");
  await form.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(form.getByText("Подтвердите, что представляете этот зал")).toBeVisible();

  await form.getByRole("checkbox", { name: "Я представляю этот зал" }).click();
  await form.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByText("Заявка отправлена")).toBeVisible();

  await page.goto("/clubs");
  const mine = page.getByRole("region", { name: "Мои клубы" });
  await expect(mine.getByText("Железо")).toBeVisible();
  await expect(mine.getByText("На проверке")).toBeVisible();
  await expect(mine.getByText("Отклонена: Нет такого зала")).toBeVisible();

  // Похожие — только одобренные: заявка «Железо» на проверке не подсказывается, одобренный «Железо Про» — да
  await page.goto("/clubs/new");
  await form.getByLabel("Город").fill(city);
  await form.getByLabel("Название").fill("Железо");
  await expect(form.getByLabel("Адрес")).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(form.getByText("Возможно, ваш зал уже есть")).toHaveCount(0);
  await createClub(me.login, { status: "APPROVED", city, name: "Железо Про" });
  await form.getByLabel("Название").fill("Железо ");
  await expect(form.getByText("Возможно, ваш зал уже есть")).toBeVisible();
  await expect(form.getByRole("link", { name: "Железо Про" })).toBeVisible();

  // Лимит заявок на проверке
  await createClub(me.login, { status: "PENDING" });
  await createClub(me.login, { status: "PENDING" });
  await form.getByLabel("Адрес").fill("ул. Спортивная, 4");
  await form.getByLabel("Контакт зала").fill("+7 900 111-22-33");
  await form.getByRole("checkbox", { name: "Я представляю этот зал" }).click();
  await form.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(form.getByText("Не больше 3 заявок на проверке")).toBeVisible();
});

test("menu item with the flag", async ({ page }) => {
  await clubsUser(page);
  await page.goto("/dashboard");
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.getByRole("navigation").getByRole("link", { name: "Клуб", exact: true }).click();
  } else {
    await page.getByRole("button", { name: /Меню профиля/ }).click();
    await page.getByRole("menuitem", { name: "Клуб", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/clubs$/);
});

const nick = () => `Клубень${unique()}`;

/** Второй игрок в своём контексте. */
async function secondUser(browser: import("@playwright/test").Browser) {
  const page = await (await browser.newContext()).newPage();
  const user = await clubsUser(page);
  return { page, user };
}

test("join by link: nickname, consent, switching clubs, leave", async ({ page, browser }) => {
  const me = await clubsUser(page);
  const owner = await secondUser(browser);
  const old = await createClub(owner.user.login, { name: `Старый ${unique()}` });
  const club = await createClub(owner.user.login, { name: `Новый ${unique()}` });

  // Не участник: шапка и «Вступить», без ленты
  await page.goto(`/clubs/${club.id}`);
  await expect(page.getByRole("heading", { level: 1, name: /Новый/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Лента" })).toHaveCount(0);

  // Без ника — форма ника
  await page.goto(`/clubs/join/${club.code}`);
  await expect(page.getByRole("textbox", { name: "Ник" })).toBeVisible();
  await setNickname(me.login, nick());
  await joinClub(me.login, old.id);
  await page.reload();
  await expect(page.getByText("Участники клуба увидят твой ник, уровень, опыт и достижения. Тренировки — нет.")).toBeVisible();
  await expect(page.getByText(/Ты выйдешь из «Старый/)).toBeVisible();
  await page.getByRole("button", { name: "Вступить" }).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}`));
  expect(await clubOf(me.login)).toBe(club.id);

  await page.getByRole("button", { name: "Выйти из клуба" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Выйти" }).click();
  await expect.poll(() => clubOf(me.login)).toBeNull();
});

test("rating and feed: events only, after joining, privacy", async ({ page, browser }) => {
  const me = await clubsUser(page);
  await setNickname(me.login, nick());
  const other = await secondUser(browser);
  const otherNick = nick();
  await setNickname(other.user.login, otherNick);
  const idle = await secondUser(browser);
  await setNickname(idle.user.login, nick());
  const club = await createClub(me.login);
  await joinClub(me.login, club.id);
  await joinClub(other.user.login, club.id, new Date(Date.now() - 60_000 * 60));
  await joinClub(idle.user.login, club.id);

  // До вступления — не видно; после — только события
  await seedXpWorkout(other.user.login, { xp: 50, finishedAt: new Date(Date.now() - 60_000 * 120), name: "Тайная", meta: { achievements: [{ code: "workouts:1", title: "Ранняя ачивка" }] } });
  await seedXpWorkout(other.user.login, { xp: 300, name: "Грудь секретная", meta: { achievements: [{ code: "workouts:1", title: "Первая тренировка" }] } });
  await seedXpWorkout(me.login, { xp: 120 });

  await page.goto(`/clubs/${club.id}`);
  const rating = page.getByRole("table", { name: "Рейтинг клуба" });
  await expect(rating.getByRole("row").nth(1)).toContainText(otherNick);
  await expect(rating.getByRole("row", { name: /ты/ })).toBeVisible();
  await expect(page.getByText("Ещё 1 без тренировок")).toBeVisible();
  // Согласие обещает «Тренировки — нет»: число тренировок участников не показывается
  await expect(rating.getByRole("columnheader", { name: "Тренировки" })).toHaveCount(0);
  const sections = page.getByRole("navigation", { name: "Разделы клуба" });
  await page.getByRole("navigation", { name: "Период" }).getByRole("link", { name: "Месяц" }).click();
  await expect(rating.getByRole("row").nth(1)).toContainText(otherNick);

  await sections.getByRole("link", { name: "Лента" }).click();
  const feed = page.getByRole("list", { name: "Лента клуба" });
  await expect(feed.getByText("Первая тренировка")).toBeVisible();
  await expect(feed.getByText("Ранняя ачивка")).toHaveCount(0);
  await expect(page.getByText("Грудь секретная")).toHaveCount(0);
  await expect(page.getByText(/4\s?321/)).toHaveCount(0);

  await setPrivacy(other.user.login, { shareActivity: false });
  await page.reload();
  await expect(page.getByText("Первая тренировка")).toHaveCount(0);
  await sections.getByRole("link", { name: "Рейтинг" }).click();
  await expect(page.getByRole("table", { name: "Рейтинг клуба" })).toContainText(otherNick);
});

test("hidden and pending clubs", async ({ page, browser }) => {
  const me = await clubsUser(page);
  await setNickname(me.login, nick());
  const stranger = await secondUser(browser);
  const club = await createClub(stranger.user.login);
  await joinClub(me.login, club.id);

  // Экран вступления открыт, клуб скрыли — вступить нельзя
  const other = await createClub(stranger.user.login);
  await page.goto(`/clubs/join/${other.code}`);
  await setClubStatus(other.id, "HIDDEN");
  await page.getByRole("button", { name: "Вступить" }).click();
  await expect(page.getByText("Клуб недоступен")).toBeVisible();
  expect((await page.goto(`/clubs/join/${other.code}`))?.status()).toBe(404);

  await setClubStatus(club.id, "HIDDEN");
  await page.goto(`/clubs/${club.id}`);
  await expect(page.getByText("Клуб скрыт модератором")).toBeVisible();
  expect((await stranger.page.goto(`/clubs/${other.id}`))?.status()).toBe(200); // админ видит свой скрытый
  const outsider = await secondUser(browser);
  expect((await outsider.page.goto(`/clubs/${club.id}`))?.status()).toBe(404);

  // На проверке и отклонённая — только своему админу
  const pending = await createClub(me.login, { status: "PENDING" });
  await page.goto(`/clubs/${pending.id}`);
  await expect(page.getByText("На проверке")).toBeVisible();
  expect((await outsider.page.goto(`/clubs/${pending.id}`))?.status()).toBe(404);
  const rejected = await createClub(me.login, { status: "REJECTED", rejectReason: "Нет такого зала" });
  await page.goto(`/clubs/${rejected.id}`);
  await expect(page.getByText("Заявка отклонена: Нет такого зала")).toBeVisible();
});

test("manage: edit, kick with ban, unban, transfer, new link", async ({ page, browser }) => {
  const admin = await clubsUser(page);
  await setNickname(admin.login, nick());
  const member = await secondUser(browser);
  const memberNick = nick();
  await setNickname(member.user.login, memberNick);
  const outsider = await secondUser(browser);
  const outsiderNick = nick();
  await setNickname(outsider.user.login, outsiderNick);
  const club = await createClub(admin.login, { city: `Управград${unique()}` });
  await joinClub(admin.login, club.id);
  await joinClub(member.user.login, club.id);

  // Не админу — 404
  expect((await member.page.goto(`/clubs/${club.id}/manage`))?.status()).toBe(404);

  await page.goto(`/clubs/${club.id}/manage`);
  // Правка адреса
  await page.getByRole("button", { name: "Изменить" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Адрес").fill("пр. Новый, 10");
  await edit.getByRole("button", { name: "Сохранить" }).click();
  await expect(edit).toBeHidden();
  await page.goto(`/clubs/${club.id}`);
  await expect(page.getByText(/пр\. Новый, 10/)).toBeVisible();

  // Исключение = бан; у своей строки кнопки нет
  await page.goto(`/clubs/${club.id}/manage`);
  const members = page.getByRole("list", { name: "Участники" });
  await expect(members.getByRole("listitem").filter({ hasText: "(вы)" }).getByRole("button", { name: /Исключить/ })).toHaveCount(0);
  await members.getByRole("listitem").filter({ hasText: memberNick }).getByRole("button", { name: /Исключить/ }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Он не сможет вступить снова, пока вы не разблокируете")).toBeVisible();
  await confirm.getByRole("button", { name: "Исключить" }).click();
  await expect.poll(() => clubOf(member.user.login)).toBeNull();
  await member.page.goto(`/clubs/join/${club.code}`);
  await expect(member.page.getByText("Админ клуба ограничил вступление")).toBeVisible();

  await page.reload();
  await page.getByRole("list", { name: "Заблокированные" }).getByRole("listitem").filter({ hasText: memberNick }).getByRole("button", { name: "Разблокировать" }).click();
  await expect(page.getByRole("list", { name: "Заблокированные" })).toHaveCount(0);
  await member.page.reload();
  await member.page.getByRole("button", { name: "Вступить" }).click();
  await expect.poll(() => clubOf(member.user.login)).toBe(club.id);

  // Передача: не участнику — отказ, участнику — переходит
  await page.reload();
  const transfer = page.getByRole("form", { name: "Передать клуб" });
  await transfer.getByLabel("Ник участника").fill(outsiderNick);
  await transfer.getByRole("button", { name: "Передать" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Передать" }).click();
  await expect(transfer.getByText("Передать можно только участнику клуба")).toBeVisible();
  await transfer.getByLabel("Ник участника").fill(memberNick);
  await transfer.getByRole("button", { name: "Передать" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Передать" }).click();
  await expect.poll(() => clubAdminLogin(club.id)).toBe(member.user.login);
  expect((await page.goto(`/clubs/${club.id}/manage`))?.status()).toBe(404);

  // Новый админ меняет ссылку — старая перестаёт работать
  await member.page.goto(`/clubs/${club.id}/manage`);
  await member.page.getByRole("button", { name: "Сменить ссылку" }).click();
  await member.page.getByRole("alertdialog").getByRole("button", { name: "Сменить" }).click();
  await expect.poll(async () => (await outsider.page.goto(`/clubs/join/${club.code}`))?.status()).toBe(404);
});

test("feed: no events in the first batch — «quiet» text with «show more»", async ({ page, browser }) => {
  const me = await clubsUser(page);
  await setNickname(me.login, nick());
  const other = await secondUser(browser);
  await setNickname(other.user.login, nick());
  const club = await createClub(me.login);
  await joinClub(me.login, club.id, new Date(Date.now() - 7 * 24 * 3600 * 1000));
  await joinClub(other.user.login, club.id, new Date(Date.now() - 7 * 24 * 3600 * 1000));
  // Событие — самое старое; сверху 46 тренировок без событий (больше, чем 3 запроса по 15)
  await seedXpWorkout(other.user.login, { xp: 50, finishedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000), meta: { achievements: [{ code: "workouts:1", title: "Первая тренировка" }] } });
  await seedXpWorkouts(other.user.login, 46);

  await page.goto(`/clubs/${club.id}?tab=feed`);
  await expect(page.getByText(/Пока тихо/)).toBeVisible();
  await page.getByRole("button", { name: "Показать ещё" }).click();
  await expect(page.getByText("Первая тренировка")).toBeVisible();
});

test("joining two clubs at once from two tabs — no server error", async ({ page }) => {
  const me = await clubsUser(page);
  await setNickname(me.login, nick());
  const a = await createClub(me.login);
  const b = await createClub(me.login);
  const tab2 = await page.context().newPage();
  await page.goto(`/clubs/join/${a.code}`);
  await tab2.goto(`/clubs/join/${b.code}`);
  const errors: string[] = [];
  for (const p of [page, tab2]) p.on("response", (r) => r.status() >= 500 && errors.push(r.url()));
  await Promise.all([page.getByRole("button", { name: "Вступить" }).click(), tab2.getByRole("button", { name: "Вступить" }).click()]);
  await expect.poll(() => clubOf(me.login)).not.toBeNull();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  expect([a.id, b.id]).toContain(await clubOf(me.login));
});
