import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { quickWorkout, registerUser } from "./helpers";

// Мои данные: выгрузка и удаление аккаунта (спека 2026-10-13-account-data-design)

test("export: JSON has the workout and no secrets, CSV opens in Excel", async ({ page }) => {
  const me = await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "62,5", reps: "8" }]);
  await page.goto("/settings");
  const block = page.getByRole("region", { name: "Мои данные" });

  const [json] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
  expect(json.suggestedFilename()).toMatch(new RegExp(`^hero-fit-${me.login}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  const text = await readFile((await json.path())!, "utf8");
  expect(text).not.toContain("passwordHash");
  const data = JSON.parse(text);
  expect(data.version).toBe(1);
  expect(data.profile.login).toBe(me.login);
  expect(data.workouts[0].exercises[0].name).toBe("Жим штанги лёжа");

  const [csv] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Тренировки (CSV)" }).click()]);
  const rows = await readFile((await csv.path())!, "utf8");
  expect(rows.startsWith("﻿Дата;Тренировка;Упражнение;Подход;Разминка;Вес, кг;Повторы;RIR\r\n")).toBe(true);
  expect(rows).toContain(";Жим штанги лёжа;1;нет;62,5;8;");

  expect((await page.request.get("/account/export/xml")).status()).toBe(404);
});
