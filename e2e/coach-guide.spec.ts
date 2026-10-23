import { expect, test, type Browser } from "@playwright/test";
import { coachAssignOnce, coachCommentOn, coachProfile, coachTemplate, enableCoach, linkCoach, seedCoachProgram } from "./db";
import { quickWorkout, registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

// Тренер + клиент — два контекста, --workers=8
const nick = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function client(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, "Клиент");
  return { context, page, ...user };
}

test("new coach: first steps 0 of 6, progress grows with a template and a client; hide and bring back", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nick("g"));
  await page.goto("/coach");
  const guide = page.getByRole("region", { name: "Первые шаги" });
  await expect(guide.getByRole("heading", { name: "Первые шаги · 0 из 6" })).toBeVisible();
  await expect(guide.getByRole("listitem", { name: "Назначьте тренировку клиенту" })).toContainText("Сначала пригласите клиента");
  await expect(guide.getByRole("listitem", { name: "Назначьте тренировку клиенту" }).getByRole("link", { name: "Сделать" })).toHaveCount(0);
  await expect(guide.getByRole("listitem", { name: "Соберите шаблон тренировки" }).getByRole("link", { name: "Сделать" })).toHaveAttribute("href", "/templates/new");

  await coachTemplate(coach.login, "Грудь — тренер");
  const c = await client(browser);
  await linkCoach(coach.login, c.login);
  await page.reload();
  await expect(guide.getByRole("heading", { name: "Первые шаги · 2 из 6" })).toBeVisible();
  await expect(guide.getByRole("listitem", { name: "Пригласите первого клиента" }).getByLabel("Сделано")).toBeVisible();
  await expect(guide.getByRole("listitem", { name: "Назначьте тренировку клиенту" }).getByRole("link", { name: "Сделать" })).toHaveAttribute(
    "href",
    /\/coach\/clients\/[^/?]+\?tab=plan$/,
  );

  await guide.getByRole("button", { name: "Скрыть первые шаги" }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Первые шаги" })).toHaveCount(0);
  await page.getByRole("button", { name: "Первые шаги" }).click();
  await expect(page.getByRole("region", { name: "Первые шаги" })).toBeVisible();
  await c.context.close();
});

test("all six steps done — no first steps card and no «show» link", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nick("h"));
  await coachProfile(coach.login, { about: "Помогаю набрать силу и не бросить зал — с планом и поддержкой. ".repeat(2), publish: true });
  const templateId = await coachTemplate(coach.login, "Ноги — тренер");
  await seedCoachProgram(coach.login, templateId, { name: "Сила 8" });
  const c = await client(browser);
  await linkCoach(coach.login, c.login);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
  await coachAssignOnce(coach.login, c.login, templateId, "Ноги — тренер", today);
  await quickWorkout(c.page, "Жим штанги лёжа", [{ weight: "50", reps: "5" }]);
  await coachCommentOn(coach.login, c.login, new URL(c.page.url()).pathname.split("/").pop()!);

  await page.goto("/coach");
  await expect(page.getByRole("heading", { name: "Клиенты", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Первые шаги" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Первые шаги" })).toHaveCount(0);
  await c.context.close();
});
