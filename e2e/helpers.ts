import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

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

/** Добавить упражнения в редактор тренировки: на ПК — «+» в каталоге справа, на мобильных — через диалог. */
export async function addToWorkout(page: Page, names: string[]) {
  // Каталог показывается с брейкпоинта lg (1024px) — решаем по ширине окна, а не по isVisible (редактор мог ещё не отрисоваться)
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    const catalog = page.getByRole("complementary", { name: "Каталог упражнений" });
    for (const name of names) {
      await catalog.getByLabel("Поиск упражнения").fill(name);
      await catalog.getByRole("button", { name: `Добавить «${name}»` }).click();
      await expect(page.getByRole("region", { name }).first()).toBeVisible();
    }
    await catalog.getByLabel("Поиск упражнения").fill("");
    return;
  }
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const dialog = page.getByRole("dialog");
  for (const name of names) {
    await dialog.getByLabel("Поиск упражнения").fill(name);
    await dialog.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  }
  await dialog.getByRole("button", { name: /^Добавить \(/ }).click();
  await expect(dialog).toBeHidden();
}

/** Пустая тренировка с одним упражнением: заполнить и отметить подходы, завершить → сводка. */
export async function quickWorkout(page: Page, exercise: string, sets: { weight: string; reps: string }[]) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, [exercise]);

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

/** Выбор в Select (Base UI): открыть список по триггеру и кликнуть опцию — selectOption тут не работает. */
export async function pickOption(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Тик уведомлений; now — тестовые часы сервера (E2E_TEST_CLOCK=1 в playwright.config.ts). */
export const runTick = (request: APIRequestContext, now?: Date) =>
  request.get(`/api/cron/notifications${now ? `?now=${now.toISOString()}` : ""}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
