import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachAssignOnce, coachNotifications, coachSignals, coachTarget, coachTargetSet, coachTemplate, enableCoach, idOf, linkCoach, resetCoachSignalsDay, seedWorkouts, setTimeZone } from "./db";
import { registerUser, runTick } from "./helpers";
import { E2E_TZ_OFFSET, localAt } from "./tz";

/** Ник ≤ 20 символов и уникален между прогонами: хвост логина с меткой времени. */
const nickOf = (login: string) => `Coac_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
/** Местная дата YYYY-MM-DD через n дней (пояс e2e, не процесса Node). */
const localDate = (n: number) => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

/** Тренер со своим шаблоном и клиент, связанные напрямую в БД. */
async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login));
  const templateId = await coachTemplate(coach.login, "Ноги — база");
  const context = await browser.newContext();
  const clientPage = await context.newPage();
  const client = await registerUser(clientPage, "Маша");
  await linkCoach(coach.login, client.login);
  // Проверка сигналов — по поясу тренера, правила — по поясу клиента
  await setTimeZone(coach.login);
  await setTimeZone(client.login);
  return { coach, templateId, client, clientPage, context, clientId: await idOf(client.login) };
}

/** Назначение в прошлом, сделанное заранее (за неделю) — иначе это «задним числом» и не пропуск. */
const ahead = () => localAt(localDate(-7), "09:00");

const row = (page: Page, name: string) => page.getByRole("list", { name: "Клиенты" }).getByRole("listitem").filter({ hasText: name });

test("missed plan: label in the list and the attention block in the card", async ({ page, browser }) => {
  const { coach, templateId, client, context, clientId } = await setup(page, browser);
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-3), "19:00", ahead());
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-1), "19:00", ahead());

  await page.goto("/coach");
  await expect(row(page, "Маша").getByTestId("client-signal")).toHaveText(["Пропуски плана"]);

  await page.goto(`/coach/clients/${clientId}`);
  const block = page.getByRole("region", { name: "Требует внимания" });
  await expect(block).toContainText("Пропуски плана");
  await expect(block).toContainText("Две последние назначенные тренировки не выполнены");
  await expect(block.getByRole("link", { name: "Открыть" })).toHaveAttribute("href", `/coach/clients/${clientId}?tab=plan`);
  await context.close();
});

test("stalled target shows «Застой на весе»", async ({ page, browser }) => {
  const { coach, client, templateId, context } = await setup(page, browser);
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(3));
  await coachTarget(client.login, templateId, "Приседания со штангой", { weight: 60, step: 2.5 });
  await coachTargetSet(client.login, "Приседания со штангой", { fails: 2 });

  await page.goto("/coach");
  await expect(row(page, "Маша").getByTestId("client-signal")).toHaveText(["Застой на весе"]);
  await context.close();
});

test("a target of a template that is no longer assigned is not a stall", async ({ page, browser }) => {
  const { client, templateId, context } = await setup(page, browser);
  // Задание осталось, а назначений шаблона нет — в диалоге заданий его не видно, снять застой тренер не может
  await coachTarget(client.login, templateId, "Приседания со штангой", { weight: 60, step: 2.5 });
  await coachTargetSet(client.login, "Приседания со штангой", { fails: 2 });

  await page.goto("/coach");
  await expect(row(page, "Маша")).toBeVisible();
  await expect(row(page, "Маша").getByTestId("client-signal")).toHaveCount(0);
  await context.close();
});

test("assignments dated before they were made are not misses", async ({ page, browser }) => {
  const { coach, templateId, client, context } = await setup(page, browser);
  // Серия «с прошлой недели», назначенная сегодня: прошедшие даты тогда ещё не существовали
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-3));
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-1));

  await page.goto("/coach");
  await expect(row(page, "Маша")).toBeVisible();
  await expect(row(page, "Маша").getByTestId("client-signal")).toHaveCount(0);
  await context.close();
});

test("a fresh client has no signals and no attention block", async ({ page, browser }) => {
  const { context, clientId } = await setup(page, browser);
  await page.goto("/coach");
  await expect(row(page, "Маша")).toBeVisible();
  await expect(row(page, "Маша").getByTestId("client-signal")).toHaveCount(0);
  await page.goto(`/coach/clients/${clientId}`);
  await expect(page.getByRole("region", { name: "Требует внимания" })).toHaveCount(0);
  await context.close();
});

test("daily check notifies the coach once per new signal and resolves it after a workout", async ({ page, browser, request }) => {
  test.slow(); // тики проходят всех непроверенных тренеров тестовой базы
  const { coach, templateId, client, context, clientId } = await setup(page, browser);
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-3), "19:00", ahead());
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-1), "19:00", ahead());

  // Реальное время (в поясе e2e сейчас 12:xx, проверка — с 10:00); тестовые часы на завтра не берём: в понедельник
  // тик ещё и собирает итоги недели всей тестовой базы. Фоновый воркер может проверить тренера параллельно —
  // уникальный индекс не даёт дублей, поэтому ждём уведомление, а не читаем сразу.
  await resetCoachSignalsDay(coach.login);
  await runTick(request);
  await expect.poll(() => coachNotifications(coach.login)).toHaveLength(1);
  const [notice] = await coachNotifications(coach.login);
  expect(notice.title).toMatch(/: пропущены 2 тренировки подряд$/);
  expect(notice.url).toBe(`/coach/clients/${clientId}`);

  // Тот же день — без повторной проверки; новая проверка открытый сигнал не дублирует
  await runTick(request);
  await resetCoachSignalsDay(coach.login);
  await runTick(request);
  expect(await coachNotifications(coach.login)).toHaveLength(1);

  // Назначение позавчера выполнено (тренировка того же дня закрывает его): из двух последних прошедших одно
  // выполнено — сигнал снимается
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-2), "19:00", ahead());
  await seedWorkouts(client.login, "Приседания со штангой", [{ weight: 60, reps: 8, sets: 3 }], 2);
  await resetCoachSignalsDay(coach.login);
  await runTick(request);
  await expect.poll(() => coachSignals(coach.login)).toEqual([{ kind: "MISSED_PLAN", resolvedAt: expect.any(Date) }]);
  expect(await coachNotifications(coach.login)).toHaveLength(1);
  await context.close();
});
