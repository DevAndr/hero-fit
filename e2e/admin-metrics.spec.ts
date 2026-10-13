import { expect, test } from "@playwright/test";
import { visitDays } from "./db";
import { registerUser } from "./helpers";

test("a visit writes one day to the visit log", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/dashboard");
  await page.reload();
  await expect.poll(() => visitDays({ login: me.login })).toHaveLength(1);
});
