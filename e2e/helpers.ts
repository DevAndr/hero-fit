import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Secret123";

let counter = 0;
export function uniqueLogin() {
  return `e2e_${Date.now().toString(36)}_${process.pid}_${counter++}`;
}

/** Регистрирует нового пользователя и оставляет его залогиненным на /dashboard. */
export async function registerUser(page: Page, name = "Герой") {
  const login = uniqueLogin();
  await page.goto("/register");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Email").fill(`${login}@test.local`);
  await page.getByLabel("Имя (необязательно)").fill(name);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Повторите пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  // argon2 намеренно «тяжёлый»: под параллельной нагрузкой e2e регистрация может занять несколько секунд.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  return { login, email: `${login}@test.local` };
}

/** Пустая тренировка с одним упражнением: заполнить и отметить подходы, завершить → сводка. */
export async function quickWorkout(page: Page, exercise: string, sets: { weight: string; reps: string }[]) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Поиск упражнения").fill(exercise);
  await dialog.getByRole("button", { name: new RegExp(`^${exercise}`) }).click();
  await dialog.getByRole("button", { name: /^Добавить \(/ }).click();

  const block = page.getByRole("region", { name: exercise });
  for (let i = 3; i < sets.length; i++) await block.getByRole("button", { name: "Подход", exact: true }).click();
  for (const [i, s] of sets.entries()) {
    await block.getByLabel(`Вес, подход ${i + 1}`).fill(s.weight);
    await block.getByLabel(`Повторы, подход ${i + 1}`).fill(s.reps);
    await block.getByRole("button", { name: `Подход ${i + 1} выполнен` }).click();
  }
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}
