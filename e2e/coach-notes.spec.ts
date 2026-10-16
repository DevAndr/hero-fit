import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { enableCoach, idOf, linkCoach } from "./db";
import { registerUser } from "./helpers";

// Заметки тренера о клиенте: два контекста — --workers=8

const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  return { coach, client, url: `/coach/clients/${await idOf(client.login)}` };
}

const TEXT = "Колено: без глубоких выпадов. Дома — гантели до 20 кг";

test("coach keeps a private note; the client gets it only in «Мои данные»; removing the client deletes it", async ({ page, browser }) => {
  const { coach, client, url } = await setup(page, browser);
  try {
    await page.goto(url);
    const notes = page.getByRole("region", { name: "Заметки" });
    const field = notes.getByLabel("Заметки");
    await expect(notes.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    await field.fill(`  ${TEXT}  `);
    await notes.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();
    await expect(notes).toContainText("Изменено");

    await page.reload();
    await expect(page.getByRole("region", { name: "Заметки" }).getByLabel("Заметки")).toHaveValue(TEXT);

    // Клиент заметку в приложении не видит — только в выгрузке своих данных
    await client.page.goto("/settings");
    await expect(client.page.getByText(TEXT)).toHaveCount(0);
    const block = client.page.getByRole("region", { name: "Мои данные" });
    const [json] = await Promise.all([client.page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
    const data = JSON.parse(await readFile((await json.path())!, "utf8"));
    expect(data.coachNotesAboutMe).toEqual([expect.objectContaining({ text: TEXT, coach: nickOf(coach.login, "Coach") })]);

    // Удалить клиента — заметка удаляется; при новой связи поле пустое
    await page.getByRole("button", { name: "Удалить клиента" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Заметка о клиенте будет удалена");
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await linkCoach(coach.login, client.login);
    await page.goto(url);
    await expect(page.getByRole("region", { name: "Заметки" }).getByLabel("Заметки")).toHaveValue("");
  } finally {
    await client.context.close();
  }
});

test("clearing the note deletes it", async ({ page, browser }) => {
  const { client, url } = await setup(page, browser);
  try {
    await page.goto(url);
    const notes = page.getByRole("region", { name: "Заметки" });
    await notes.getByLabel("Заметки").fill(TEXT);
    await notes.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();
    await notes.getByLabel("Заметки").fill("   ");
    await notes.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Заметка удалена")).toBeVisible();
    await expect(notes).not.toContainText("Изменено");
  } finally {
    await client.context.close();
  }
});
