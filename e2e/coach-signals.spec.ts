import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachAssignOnce, coachTarget, coachTargetSet, coachTemplate, enableCoach, idOf, linkCoach } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ_OFFSET } from "./tz";

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
  return { coach, templateId, client, clientPage, context, clientId: await idOf(client.login) };
}

const row = (page: Page, name: string) => page.getByRole("list", { name: "Клиенты" }).getByRole("listitem").filter({ hasText: name });

test("missed plan: label in the list and the attention block in the card", async ({ page, browser }) => {
  const { coach, templateId, client, context, clientId } = await setup(page, browser);
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-3));
  await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(-1));

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
  const { client, templateId, context } = await setup(page, browser);
  await coachTarget(client.login, templateId, "Приседания со штангой", { weight: 60, step: 2.5 });
  await coachTargetSet(client.login, "Приседания со штангой", { fails: 2 });

  await page.goto("/coach");
  await expect(row(page, "Маша").getByTestId("client-signal")).toHaveText(["Застой на весе"]);
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
