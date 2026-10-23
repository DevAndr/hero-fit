import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const PASSWORD = "Secret123";

let counter = 0;
/**
 * Логин заканчивается случайными символами: тесты берут ник из его хвоста (`login.slice(-8)`), а база e2e живёт между
 * прогонами — без случайной части хвост (pid + счётчик) повторялся и ник упирался в уникальность.
 */
export function uniqueLogin() {
  return `e2e_${Date.now().toString(36)}_${process.pid}_${counter++}${Math.random().toString(36).slice(2, 6)}`;
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
  await page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ }).click();
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

/**
 * Тик уведомлений; now — тестовые часы сервера (E2E_TEST_CLOCK=1 в playwright.config.ts), only — только этот шаг
 * (`TICK_STEPS` в lib/notifications/service.ts): тик с часами в будущем по всем шагам задевает соседние тесты.
 * Нужен CRON_SECRET (в .env, в CI — env в ci.yml); без него ручка отвечает 401 — падаем сразу, а не таймаутом ожидания push.
 */
export async function runTick(request: APIRequestContext, now?: Date, only?: string) {
  const params = new URLSearchParams();
  if (now) params.set("now", now.toISOString());
  if (only) params.set("only", only);
  const query = params.toString();
  const res = await request.get(`/api/cron/notifications${query ? `?${query}` : ""}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status(), "тик уведомлений: задан ли CRON_SECRET?").toBe(200);
  return res;
}
