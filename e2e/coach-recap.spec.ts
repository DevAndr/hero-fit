import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  coachAssignOnce,
  coachCommentOn,
  coachRecapNotifications,
  coachRecapRows,
  coachTemplate,
  createUserRow,
  enableCoach,
  idOf,
  linkCoach,
  mondayWeeksAgo,
  seedCoachRecap,
  seedRecapWeek,
  setNickname,
  setTimeZone,
  setUserTimeZone,
} from "./db";
import { registerUser, runTick, uniqueLogin } from "./helpers";
import { E2E_TZ_OFFSET, localAt } from "./tz";

/*
 * Недели тиков подобраны так, чтобы не задевать соседей: тик за понедельник M строит итоги недели M+1 всем тренерам
 * и «новый старт» пользователям с тренировками недели M+2. recap.spec тикает в понедельники 2, 5, 6, 7 недель назад
 * (данные — недели 3, 6, 9), поэтому здесь тики — в понедельники 3, 9, 11, 14, 16 недель назад, у каждого теста свой.
 * Связь тренера — с воскресенья перед неделей: чужие тики за другие понедельники строят тренеру итоги других недель
 * (их отсекает фильтр по неделе), но не эту.
 */

/** Ник ≤ 20 символов и уникален между прогонами: хвост логина с меткой времени. */
const nickOf = (login: string, prefix: string) => `${prefix}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-14)}`;

/** Пояс Etc/GMT по смещению в часах (у Etc/GMT знак обратный) и суффикс ISO. */
const tzName = (offset: number) => (offset === 0 ? "UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`);
const isoOffset = (offset: number) => `${offset < 0 ? "-" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`;

const press = (o: { day: number; time?: string; records?: string[]; ups?: { from: number; to: number }[] }) => ({
  day: o.day,
  time: o.time ?? "19:00",
  exercise: "Жим штанги лёжа",
  weight: 100,
  reps: 5,
  sets: 3,
  xp: 80,
  records: o.records,
  ups: o.ups,
});

/** Тренер в поясе e2e (тик считает неделю по поясу тренера). */
async function coachUser(page: Page) {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  await setTimeZone(coach.login);
  return coach;
}

/** Клиент без входа (строка в БД) с ником; возвращает логин. */
async function clientRow(prefix: string) {
  const login = uniqueLogin();
  await createUserRow(login);
  const nick = nickOf(login, prefix);
  await setNickname(login, nick);
  return { login, nick };
}

/** Связь с воскресенья перед неделей week — клиент не «новый». */
const linkBefore = (coachLogin: string, clientLogin: string, week: string) => linkCoach(coachLogin, clientLogin, localAt(week, "00:00", -1));

/** Число в плитке общих цифр (подпись — первая строка, значение — вторая). */
const tile = (page: Page, id: string) => page.getByTestId(id).locator("p").nth(1);

const recapCard = (page: Page) => page.getByRole("region", { name: "Итоги недели клиентов" });

test.describe("ticks with the test clock", () => {
  // Копии теста в desktop и mobile тикали бы в один понедельник и создавали бы итоги друг другу раньше времени
  test.skip(({ isMobile }) => isMobile, "тик с тестовыми часами — только desktop");

  test("monday tick creates a coach recap and one notification; the page shows totals, order and links", async ({ page, request }) => {
    const week = mondayWeeksAgo(10);
    const tick = mondayWeeksAgo(9);
    const coach = await coachUser(page);
    const templateId = await coachTemplate(coach.login, "Грудь");
    // По имени порядок был бы Ann, Bob, Zoe; ждём Bob (сигналы) → Zoe (без тренировок) → Ann (рекорд и повышение)
    const a = await clientRow("Ann");
    const b = await clientRow("Zoe");
    const c = await clientRow("Bob");
    await linkBefore(coach.login, a.login, week);
    // B подключился в четверг недели: «новый» и ещё не «пропал» (сигнала нет) — выше A только из-за пустой недели
    await linkCoach(coach.login, b.login, localAt(week, "12:00", 3));
    await linkBefore(coach.login, c.login, week);

    // Назначения тренера, сделанные заранее: у A — ср (выполнено) и пт (пропуск), у C — вт и чт (оба пропущены → сигнал)
    const assigned = localAt(week, "00:00", -1);
    const day = (n: number) => new Date(Date.parse(`${week}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    await coachAssignOnce(coach.login, a.login, templateId, "Грудь", day(2), "18:00", assigned);
    await coachAssignOnce(coach.login, a.login, templateId, "Грудь", day(4), "18:00", assigned);
    await coachAssignOnce(coach.login, c.login, templateId, "Грудь", day(1), "18:00", assigned);
    await coachAssignOnce(coach.login, c.login, templateId, "Грудь", day(3), "18:00", assigned);

    // Клиент A западнее тренера: тренировка в пн 00:30 по поясу тренера у него — ещё воскресенье этой недели
    const west = Math.min(3, E2E_TZ_OFFSET + 12);
    const [first] = await seedRecapWeek(a.login, week, [
      press({ day: 2, records: ["Жим штанги лёжа"], ups: [{ from: 100, to: 105 }] }),
      press({ day: 7, time: "00:30" }),
    ]);
    await setUserTimeZone(a.login, tzName(E2E_TZ_OFFSET - west));
    // Комментарий к упражнению — тоже ответ: без ответа остаётся одна тренировка из двух
    await coachCommentOn(coach.login, a.login, first.workoutId, first.workoutExerciseId);

    const url = `/coach/recap/${week}`;
    // Чужие тики (другие понедельники) шлют тренеру итоги других недель — считаем только эту
    const sentFor = async () => (await coachRecapNotifications(coach.login)).filter((n) => n.url === url);
    await runTick(request, localAt(tick, "08:30"));
    expect(await sentFor()).toHaveLength(0);
    expect((await coachRecapRows(coach.login)).map((r) => r.week)).not.toContain(week);

    const at = localAt(tick, "09:30");
    await runTick(request, at);
    await runTick(request, at);
    await Promise.all([runTick(request, at), runTick(request, at)]);
    const sent = await sentFor();
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe("Итоги недели клиентов 📋");
    expect(sent[0].body).toBe("Неделя клиентов: 1 из 3 тренировались, план 25%. 1 требует внимания");

    await page.goto(url);
    await expect(page.getByTestId("coach-recap-trained")).toContainText("1 из 3");
    await expect(tile(page, "coach-recap-plan")).toHaveText("25%");
    await expect(tile(page, "coach-recap-workouts")).toHaveText("2");
    await expect(tile(page, "coach-recap-records")).toHaveText("1");
    await expect(tile(page, "coach-recap-ups")).toHaveText("1");
    await expect(tile(page, "coach-recap-unanswered")).toHaveText("1");
    await expect(tile(page, "coach-recap-attention")).toHaveText("1");
    // Не ноль — плитка выделена; у остальных выделения нет
    await expect(page.getByTestId("coach-recap-attention")).toHaveAttribute("data-accent", "");
    await expect(page.getByTestId("coach-recap-unanswered")).toHaveAttribute("data-accent", "");
    await expect(page.getByTestId("coach-recap-workouts")).not.toHaveAttribute("data-accent");

    const cards = recapCard(page).getByRole("listitem");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toHaveAttribute("aria-label", c.nick);
    await expect(cards.nth(1)).toHaveAttribute("aria-label", b.nick);
    await expect(cards.nth(2)).toHaveAttribute("aria-label", a.nick);

    const cardC = recapCard(page).getByRole("listitem", { name: c.nick });
    await expect(cardC.getByTestId("client-signal").first()).toHaveText("Пропуски плана");
    await expect(cardC).toContainText("План 0/2 · 0 тренировок");
    const cardB = recapCard(page).getByRole("listitem", { name: b.nick });
    await expect(cardB).toContainText("новый");
    await expect(cardB).toContainText("0 тренировок");
    await expect(cardB.getByTestId("client-signal")).toHaveCount(0);
    const cardA = recapCard(page).getByRole("listitem", { name: a.nick });
    await expect(cardA).toContainText("План 1/2 · 2 тренировки (+2)");
    await expect(cardA).toContainText("🏆 Рекорды: Жим штанги лёжа");
    await expect(cardA).toContainText("↑ Жим штанги лёжа +5 кг");
    await expect(cardA).toContainText("💬 1 без ответа");
    await expect(cardA).not.toContainText("новый");

    await cardA.getByRole("link", { name: a.nick }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/clients/${await idOf(a.login)}$`));
  });

  test("the page creates the recap before the tick; the tick after viewing sends no push", async ({ page, request }) => {
    // Неделя не старше 8 — её страница строит снимок сама
    const week = mondayWeeksAgo(4);
    const coach = await coachUser(page);
    const client = await clientRow("Kim");
    await linkBefore(coach.login, client.login, week);
    await seedRecapWeek(client.login, week, [press({ day: 1 })]);

    await page.goto(`/coach/recap/${week}`);
    await expect(page.getByTestId("coach-recap-trained")).toContainText("1 из 1");
    await expect(recapCard(page).getByRole("listitem", { name: client.nick })).toContainText("1 тренировка");
    const [row] = (await coachRecapRows(coach.login)).filter((r) => r.week === week);
    expect(row.seenAt).not.toBeNull();

    await runTick(request, localAt(mondayWeeksAgo(3), "09:30"));
    expect((await coachRecapNotifications(coach.login)).filter((n) => n.url === `/coach/recap/${week}`)).toHaveLength(0);
    expect((await coachRecapRows(coach.login)).find((r) => r.week === week)?.pushedAt).toBeNull();

    // Номер страницы нецелый — первая страница, а не ошибка
    await page.goto("/coach/recap?page=1.7");
    await page.getByRole("link", { name: /1 из 1/ }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/recap/${week}$`));
  });

  test("setting off — recap without a notification", async ({ page, request }) => {
    const week = mondayWeeksAgo(12);
    const coach = await coachUser(page);
    await page.goto("/settings");
    const toggle = page.getByRole("switch", { name: "Итоги недели клиентов — в понедельник утром" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    const client = await clientRow("Lee");
    await linkBefore(coach.login, client.login, week);
    await seedRecapWeek(client.login, week, [press({ day: 3 })]);
    await runTick(request, localAt(mondayWeeksAgo(11), "09:30"));

    expect((await coachRecapRows(coach.login)).map((r) => r.week)).toContain(week);
    expect((await coachRecapNotifications(coach.login)).filter((n) => n.url === `/coach/recap/${week}`)).toHaveLength(0);
    await page.goto(`/coach/recap/${week}`);
    await expect(page.getByTestId("coach-recap-trained")).toContainText("1 из 1");
  });

  test("a coach whose only client linked after the week gets no recap", async ({ page, request }) => {
    const coach = await coachUser(page);
    const client = await clientRow("New");
    // Связь — сейчас: ни одна прошедшая неделя её не застала
    await linkCoach(coach.login, client.login);
    await runTick(request, localAt(mondayWeeksAgo(14), "09:30"));

    expect(await coachRecapRows(coach.login)).toEqual([]);
    await page.goto("/coach/recap");
    await expect(page.getByText("Итоги появятся в понедельник после первой недели с клиентами.")).toBeVisible();
    // Неделя без клиентов — страницы нет (а не «итоги ещё собираются»)
    await page.goto(`/coach/recap/${mondayWeeksAgo(2)}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });

  test("the tick waits until the week ends for a client far to the west", async ({ page, request }) => {
    // Тренер восточнее пояса e2e минимум на 2 ч, клиент — на 10 ч западнее тренера. Тики в 09:30 и 10:30 по тренеру —
    // по поясу e2e до 09:00: остальные тренеры и пользователи e2e их не замечают.
    const coachOffset = Math.max(E2E_TZ_OFFSET + 2, -2);
    const week = mondayWeeksAgo(17);
    const tick = mondayWeeksAgo(16);
    const at = (time: string) => new Date(`${tick}T${time}:00${isoOffset(coachOffset)}`);

    const coach = await registerUser(page, "Тренер");
    await enableCoach(coach.login, nickOf(coach.login, "Coach"));
    await setUserTimeZone(coach.login, tzName(coachOffset));
    const client = await clientRow("Far");
    await setUserTimeZone(client.login, tzName(coachOffset - 10));
    await linkCoach(coach.login, client.login, new Date(Date.parse(`${week}T00:00:00${isoOffset(coachOffset)}`) - 86_400_000));

    // У клиента ещё воскресенье 23:30 — снимок рано
    await runTick(request, at("09:30"));
    expect((await coachRecapRows(coach.login)).map((r) => r.week)).not.toContain(week);
    // У клиента понедельник 00:30 — неделя кончилась у всех
    await runTick(request, at("10:30"));
    expect((await coachRecapRows(coach.login)).map((r) => r.week)).toContain(week);
    const sent = (await coachRecapNotifications(coach.login)).filter((n) => n.url === `/coach/recap/${week}`);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe("Неделя клиентов: никто не тренировался — загляните, кому написать");
  });
});

/** Второй пользователь в своём контексте браузера (клиент, который сам заходит в настройки). */
async function another(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { ...user, page, context };
}

test("unlinking removes the client from old recaps; totals stay", async ({ page, browser }) => {
  test.slow();
  // Страница строит снимок сама (без тика), неделя не старше 8
  const week = mondayWeeksAgo(5);
  const coach = await coachUser(page);
  const leaver = await another(browser, "Клиент");
  try {
    const leaverNick = nickOf(leaver.login, "Ivy");
    await setNickname(leaver.login, leaverNick);
    const stays = await clientRow("Max");
    await linkBefore(coach.login, leaver.login, week);
    await linkBefore(coach.login, stays.login, week);
    await seedRecapWeek(leaver.login, week, [press({ day: 2 })]);

    await page.goto(`/coach/recap/${week}`);
    await expect(page.getByTestId("coach-recap-trained")).toContainText("1 из 2");
    await expect(recapCard(page).getByRole("listitem", { name: leaverNick })).toBeVisible();

    await leaver.page.goto("/settings");
    const card = leaver.page.getByRole("region", { name: "Мой тренер" });
    await card.getByRole("button", { name: "Отключить тренера" }).click();
    await leaver.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(leaver.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();

    await page.reload();
    await expect(recapCard(page).getByRole("listitem", { name: stays.nick })).toBeVisible();
    await expect(recapCard(page).getByRole("listitem", { name: leaverNick })).toHaveCount(0);
    await expect(page.getByTestId("coach-recap-trained")).toContainText("1 из 2");
  } finally {
    await leaver.context.close();
  }
});

// Анонс — про прошлую неделю по настоящим часам. Клиент подключён сейчас: фоновый воркер (в понедельник после 09:00)
// не построит этому тренеру настоящий снимок прошлой недели — засеянный снимок не перепишется и не задвоится.
test("the announce on /coach shows until the recap is viewed", async ({ page }) => {
  const lastWeek = mondayWeeksAgo(1);
  const coach = await coachUser(page);
  const client = await clientRow("Ana");
  await linkCoach(coach.login, client.login);
  await seedCoachRecap(coach.login, client.login, lastWeek);

  await page.goto("/coach");
  const announce = page.getByRole("region", { name: "Итоги недели готовы" });
  await expect(announce).toContainText("Тренировались 1 из 1");
  await announce.getByRole("link", { name: "Смотреть" }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/recap/${lastWeek}$`));
  await expect(page.getByTestId("coach-recap-trained")).toBeVisible();
  await page.goto("/coach");
  await expect(page.getByRole("heading", { name: "Клиенты" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Итоги недели готовы" })).toHaveCount(0);
});

test("mobile: no horizontal scroll", async ({ page, isMobile }) => {
  test.skip(!isMobile, "проверка мобильной вёрстки");
  const week = mondayWeeksAgo(1);
  const coach = await coachUser(page);
  const client = await clientRow("Long");
  await linkCoach(coach.login, client.login);
  await seedCoachRecap(coach.login, client.login, week);

  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto(`/coach/recap/${week}`);
  await expect(page.getByTestId("coach-recap-trained")).toBeVisible();
  expect(await noScroll()).toBe(0);
  await page.goto("/coach/recap");
  await expect(page.getByRole("link", { name: /1 из 1/ })).toBeVisible();
  expect(await noScroll()).toBe(0);
});
