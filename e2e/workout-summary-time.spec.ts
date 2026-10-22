import { expect, test } from "@playwright/test";
import { quickWorkout, registerUser } from "./helpers";

// Пояс игрока далеко и от UTC (сервер в проде), и от Москвы (локальный сервер): время в сводке — по поясу игрока
const TZ = "Pacific/Kiritimati";
test.use({ timezoneId: TZ });

test("summary shows the finish time in the player's time zone", async ({ page }) => {
  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  await registerUser(page);
  const before = fmt.format(new Date());
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "50", reps: "5" }]);
  const after = fmt.format(new Date());
  const header = page.locator("header, main").getByText(/ в \d{2}:\d{2}$|\d{2}:\d{2}$/).first();
  await expect(header).toHaveText(new RegExp(`^(${before}|${after})$`));
});
