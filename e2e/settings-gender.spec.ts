import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test("gender: not set by default, saved on choice, in «My data» export, can be cleared", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Пол" });
  await expect(card.getByRole("radio", { name: "Не указан" })).toBeChecked();

  await card.getByRole("radio", { name: "Женский" }).click();
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.reload();
  await expect(card.getByRole("radio", { name: "Женский" })).toBeChecked();

  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.profile.gender).toBe("FEMALE");

  await card.getByRole("radio", { name: "Не указан" }).click();
  await expect(page.getByText("Сохранено").first()).toBeVisible();
  await page.reload();
  await expect(card.getByRole("radio", { name: "Не указан" })).toBeChecked();
});
