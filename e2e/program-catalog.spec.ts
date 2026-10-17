import { expect, test } from "@playwright/test";
import { coachProfile, coachTemplate, enableCoach, resetFlag, seedCoachProgram, setFlag } from "./db";
import { registerUser } from "./helpers";

// Каталог программ тренеров — под глобальным флагом program_catalog: сценарии по очереди, только desktop
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "глобальный флаг — один проект");
  await setFlag("program_catalog", { enabled: true, percent: 100 });
});
test.afterEach(async ({}, info) => {
  if (info.project.name === "desktop") await resetFlag("program_catalog");
});

const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

test("a coach publishes a program and a user sees it in the catalog", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  await coachProfile(coach.login, { about: "Тренер", publish: true });
  const name = `Сила ${nick}`;
  const templateId = await coachTemplate(coach.login, `Ноги ${nick}`);
  await seedCoachProgram(coach.login, templateId, { name, weekdays: [0, 2, 4] });

  await page.goto("/coach/programs");
  const item = page.getByRole("listitem", { name });
  await expect(item).not.toContainText("В каталоге");
  await item.getByRole("button", { name: `Изменить «${name}»` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("switch", { name: "Опубликовать в каталоге" }).click();
  // Без описания публикация не проходит
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Добавьте описание для каталога")).toBeVisible();
  await dialog.getByLabel("Описание для каталога").fill("Для новичков: сила в трёх днях, нужна штанга");
  await expect(dialog).toContainText("Для кого, цель, инвентарь");
  await expect(dialog).toContainText("44 / 300");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(item).toContainText("В каталоге · занимаются 0");

  const user = await browser.newContext();
  try {
    const userPage = await user.newPage();
    await registerUser(userPage, "Атлет");
    await userPage.goto("/dashboard");
    await userPage.getByRole("link", { name: "Программы" }).first().click();
    await expect(userPage).toHaveURL(/\/programs$/);
    const card = userPage.getByRole("listitem", { name });
    await expect(card).toContainText("+2,5 % в неделю · разгрузка каждую 4-ю неделю");
    await expect(card).toContainText("8 нед.");
    await expect(card).toContainText("3 дня в неделю");
    await expect(card).toContainText("занимаются 0");
    await expect(card.getByRole("link", { name: nick, exact: true })).toHaveAttribute("href", `/trainer/${nick}`);

    await card.getByRole("link", { name, exact: true }).click();
    await expect(userPage.getByRole("heading", { name })).toBeVisible();
    await expect(userPage.getByText("Для новичков: сила в трёх днях, нужна штанга")).toBeVisible();
    const days = userPage.getByRole("list", { name: "Дни недели" });
    await expect(days).toContainText("Пн");
    await expect(days).toContainText("Ср");
    await expect(days).toContainText("Пт");
    await expect(days).toContainText(`Ноги ${nick}`);
    await expect(days).toContainText("Приседания со штангой");
    await expect(userPage.getByRole("list", { name: "Предпросмотр по неделям" })).toContainText("4: 95 кг");

    // Снять с публикации — из каталога пропадает
    await item.getByRole("button", { name: `Изменить «${name}»` }).click();
    await dialog.getByRole("switch", { name: "Опубликовать в каталоге" }).click();
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await userPage.goto("/programs");
    await expect(userPage.getByRole("listitem", { name })).toHaveCount(0);
  } finally {
    await user.close();
  }
});

test("without the flag the catalog is hidden", async ({ page }) => {
  await setFlag("program_catalog", { enabled: false });
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  const name = `Сила ${nick}`;
  const programId = await seedCoachProgram(coach.login, await coachTemplate(coach.login, `Ноги ${nick}`), { name, publish: true, description: "Описание" });

  expect((await page.goto("/programs"))?.status()).toBe(404);
  expect((await page.goto(`/programs/${programId}`))?.status()).toBe(404);
  expect((await page.goto("/admin/programs"))?.status()).toBe(404);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Программы" })).toHaveCount(0);

  await page.goto("/coach/programs");
  await expect(page.getByRole("listitem", { name })).not.toContainText("В каталоге");
  await page.getByRole("button", { name: `Изменить «${name}»` }).click();
  await expect(page.getByRole("switch", { name: "Опубликовать в каталоге" })).toHaveCount(0);
});
