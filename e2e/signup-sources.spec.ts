import { expect, test, type BrowserContext } from "@playwright/test";
import { signupSourceOf, signupUtmOf } from "./db";
import { registerUser } from "./helpers";

async function srcCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === "hf_src");
}

async function utmCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === "hf_utm");
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

test("background fetch of a page (RSC prefetch) does not set the cookie", async ({ request }) => {
  // Так prefetch главной доходит до proxy: Next.js срезает rsc и next-router-prefetch, остаются Sec-Fetch-Dest и next-url
  const res = await request.get("/", { headers: { "next-url": "/register", "sec-fetch-dest": "empty" } });
  expect(res.ok()).toBe(true);
  expect(res.headers()["set-cookie"] ?? "").not.toContain("hf_src");
});

test("authenticated user gets no hf_src",async ({ page, context }) => {
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

test("registration saves the first-touch source and deletes the cookie", async ({ page, context }) => {
  await page.goto("/training-programs/5x5", { referer: "https://yandex.ru/search?text=5x5" });
  expect((await srcCookie(context))?.value).toBe("program.search");
  const me = await registerUser(page);
  expect(await signupSourceOf(me.login)).toEqual({ landing: "program", referrer: "search" });
  expect(await srcCookie(context)).toBeUndefined();
});

test("registration without a cookie is other/direct", async ({ page, context }) => {
  await page.goto("/register");
  await context.clearCookies({ name: "hf_src" });
  const me = await registerUser(page);
  expect(await signupSourceOf(me.login)).toEqual({ landing: "other", referrer: "direct" });
});

test("guest on a coach invite link gets trainer source on the redirect", async ({ request }) => {
  const res = await request.get("/coach/join/ANYCODE1", { maxRedirects: 0, headers: { referer: "https://yandex.ru/" } });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.headers()["set-cookie"] ?? "").toContain("hf_src=trainer.search");
});

test("guest on a guild invite link is not tagged by the redirect", async ({ request }) => {
  const res = await request.get("/guild/join/ANYCODE1", { maxRedirects: 0 });
  expect(res.headers()["set-cookie"] ?? "").not.toContain("hf_src");
});

test("forged hf_src does not break registration and counts as other/direct", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hf_src", value: "evil.x", url: baseURL! }]);
  const me = await registerUser(page);
  expect(await signupSourceOf(me.login)).toEqual({ landing: "other", referrer: "direct" });
});

test("utm link sets hf_utm, a later utm link overwrites it, a plain visit keeps it", async ({ page, context }) => {
  await page.goto("/?utm_source=blogger&utm_campaign=Ivan%20Fit");
  const first = await utmCookie(context);
  expect(first?.httpOnly).toBe(true);
  expect(decodeURIComponent(first!.value)).toBe("blogger|ivan_fit");
  expect((await srcCookie(context))?.value).toBe("home.direct");

  await page.goto("/training-programs?utm_source=blogger&utm_campaign=masha");
  expect(decodeURIComponent((await utmCookie(context))!.value)).toBe("blogger|masha");
  expect((await srcCookie(context))?.value).toBe("home.direct");

  await page.goto("/tools/1rm");
  expect(decodeURIComponent((await utmCookie(context))!.value)).toBe("blogger|masha");
});

test("registration saves the utm label and deletes hf_utm", async ({ page, context }) => {
  await page.goto("/training-programs/5x5?utm_source=yandex&utm_campaign=Маша");
  const me = await registerUser(page);
  expect(await signupUtmOf(me.login)).toEqual({ source: "yandex", campaign: "маша" });
  expect(await utmCookie(context)).toBeUndefined();
});

test("yclid without utm is yandex_direct; no label is null", async ({ page, browser }) => {
  await page.goto("/?yclid=12345");
  const direct = await registerUser(page);
  expect(await signupUtmOf(direct.login)).toEqual({ source: "yandex_direct", campaign: null });

  const ctx = await browser.newContext();
  const plain = await registerUser(await ctx.newPage());
  await ctx.close();
  expect(await signupUtmOf(plain.login)).toEqual({ source: null, campaign: null });
});

test("authenticated user gets no hf_utm", async ({ page, context }) => {
  await registerUser(page);
  await page.goto("/?utm_source=blogger&utm_campaign=x");
  expect(await utmCookie(context)).toBeUndefined();
});

test("forged hf_utm is ignored at registration", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hf_utm", value: "Evil%20Value|x", url: baseURL! }]);
  const me = await registerUser(page);
  expect(await signupUtmOf(me.login)).toEqual({ source: null, campaign: null });
});
