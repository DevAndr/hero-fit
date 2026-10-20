import { expect, test, type BrowserContext } from "@playwright/test";
import { registerUser } from "./helpers";

async function srcCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === "hf_src");
}

test("guest first touch sets hf_src and keeps it on later visits", async ({ page, context }) => {
  await page.goto("/training-programs/5x5", { referer: "https://yandex.ru/search?text=5x5" });
  const first = await srcCookie(context);
  expect(first?.value).toBe("program.search");
  expect(first?.httpOnly).toBe(true);
  expect(first?.sameSite).toBe("Lax");

  await page.goto("/", { referer: "https://t.me/somechannel" });
  expect((await srcCookie(context))?.value).toBe("program.search");
});

test("guest on home without referer is home.direct", async ({ page, context }) => {
  await page.goto("/");
  expect((await srcCookie(context))?.value).toBe("home.direct");
});

test("redirect from a closed path does not set the cookie", async ({ request }) => {
  const res = await request.get("/dashboard", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.headers()["set-cookie"] ?? "").not.toContain("hf_src");
});

test("authenticated user gets no hf_src", async ({ page, context }) => {
  await registerUser(page);
  await context.clearCookies({ name: "hf_src" });
  await page.goto("/", { referer: "https://yandex.ru/" });
  expect(await srcCookie(context)).toBeUndefined();
});

test("logged-out visitor with a live refresh token gets no hf_src", async ({ page, context }) => {
  await registerUser(page);
  await context.clearCookies({ name: "hf_src" });
  await context.clearCookies({ name: "hf_at" });
  await page.goto("/", { referer: "https://yandex.ru/" });
  expect(await srcCookie(context)).toBeUndefined();
});
