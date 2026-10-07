import { expect, test, type Locator, type Page } from "@playwright/test";
import { registerUser } from "./helpers";

const list = (page: Page) => page.getByTestId("workout-drop-list");
const order = (page: Page) => list(page).getByRole("region").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const catalog = (page: Page) => page.getByRole("complementary", { name: "Каталог упражнений" });
const catalogItem = (page: Page, name: string) => catalog(page).getByTestId("catalog-item").filter({ hasText: name });

/** Перетаскивание мышью (dnd-kit ждёт pointer-события с промежуточными шагами). */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, drop = true) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 4, { steps: 4 }); // порог активации
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.move(to.x, to.y + 1, { steps: 2 });
  if (drop) await page.mouse.up();
}

async function point(locator: Locator, where: "left" | "top" | "center" | "bottom") {
  // Без автопрокрутки: координаты источника и цели берутся до перетаскивания и должны остаться верными
  const b = (await locator.boundingBox())!;
  if (where === "left") return { x: b.x + 16, y: b.y + b.height / 2 };
  const y = where === "top" ? b.y + 12 : where === "bottom" ? b.y + b.height - 12 : b.y + b.height / 2;
  return { x: b.x + b.width / 2, y };
}

test.beforeEach(async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
});

test("desktop: build workout by dragging from catalog, reorder by handle (mouse + keyboard)", async ({ page, isMobile }) => {
  test.skip(isMobile, "перетаскивание — только на ПК");
  await expect(page.getByRole("button", { name: "Добавить упражнение" })).toBeHidden();
  await expect(list(page)).toContainText("Перетащите упражнения сюда");

  // Из каталога в пустой список
  await catalog(page).getByLabel("Поиск упражнения").fill("Подтягивания");
  await drag(page, await point(catalogItem(page, "Подтягивания"), "left"), await point(list(page), "center"));
  await expect.poll(() => order(page)).toEqual(["Подтягивания"]);

  // «+» — в конец, отметка «в тренировке»
  await catalog(page).getByLabel("Поиск упражнения").fill("Жим штанги");
  await catalog(page).getByRole("button", { name: "Добавить «Жим штанги лёжа»" }).click();
  await expect.poll(() => order(page)).toEqual(["Подтягивания", "Жим штанги лёжа"]);
  await expect(catalogItem(page, "Жим штанги лёжа")).toContainText("в тренировке");

  // Из каталога в начало: над верхней половиной первого блока — линия-индикатор, затем вставка
  await catalog(page).getByLabel("Поиск упражнения").fill("Приседания");
  const first = list(page).getByRole("region").first();
  await drag(page, await point(catalogItem(page, "Приседания со штангой"), "left"), await point(first, "top"), false);
  await expect(page.getByTestId("drop-indicator")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("drop-indicator")).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(["Приседания со штангой", "Подтягивания", "Жим штанги лёжа"]);

  // Перестановка мышью за ручку: «Подтягивания» на место первого
  const handle = (name: string) => page.getByRole("button", { name: `Переставить «${name}»` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await drag(page, await point(handle("Подтягивания"), "center"), await point(first, "center"));
  await expect.poll(() => order(page)).toEqual(["Подтягивания", "Приседания со штангой", "Жим штанги лёжа"]);

  // С клавиатуры: «Жим» (за пределами экрана) на одну позицию выше
  await handle("Жим штанги лёжа").focus();
  // Озвучка для скринридеров (live-регион dnd-kit) — заодно ждём, пока позиция пересчитается
  const live = page.locator("[id^=DndLiveRegion]");
  await page.keyboard.press("Space");
  await expect(live).toHaveText("Жим штанги лёжа — позиция 3 из 3.");
  await page.keyboard.press("ArrowUp");
  await expect(live).toHaveText("Жим штанги лёжа — позиция 2 из 3.");
  await page.keyboard.press("Space");
  await expect(live).toHaveText("Жим штанги лёжа — поставлено.");
  await expect.poll(() => order(page)).toEqual(["Подтягивания", "Жим штанги лёжа", "Приседания со штангой"]);

  // Порядок сохраняется в черновик
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect.poll(() => order(page)).toEqual(["Подтягивания", "Жим штанги лёжа", "Приседания со штангой"]);
});

test("mobile: no catalog and handles, dialog adds exercises", async ({ page, isMobile }) => {
  test.skip(!isMobile, "мобильная раскладка");
  await expect(catalog(page)).toBeHidden();
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Поиск упражнения").fill("Подтягивания");
  await dialog.getByRole("button", { name: /^Подтягивания/ }).click();
  await dialog.getByRole("button", { name: /^Добавить \(/ }).click();
  await expect.poll(() => order(page)).toEqual(["Подтягивания"]);
  await expect(page.getByRole("button", { name: "Переставить «Подтягивания»" })).toBeHidden();
});
