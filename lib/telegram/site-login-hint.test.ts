import { describe, expect, it } from "vitest";
import { SITE_LOGIN_HINT_DAYS, siteLoginHintDue } from "./site-login-hint";

const DAY = 86_400_000;
const now = new Date("2026-10-30T12:00:00Z");
const user = (o: Partial<Parameters<typeof siteLoginHintDue>[0]> = {}) => ({
  hasPassword: false,
  telegram: true,
  createdAt: new Date(now.getTime() - DAY),
  completed: 0,
  ...o,
});

describe("siteLoginHintDue", () => {
  it("3 days after signup", () => {
    expect(SITE_LOGIN_HINT_DAYS).toBe(3);
    expect(siteLoginHintDue(user({ createdAt: new Date(now.getTime() - 3 * DAY + 1000) }), now)).toBe(false);
    expect(siteLoginHintDue(user({ createdAt: new Date(now.getTime() - 3 * DAY) }), now)).toBe(true);
  });

  it("or right after the first completed workout", () => {
    expect(siteLoginHintDue(user({ completed: 1 }), now)).toBe(true);
  });

  it("not for accounts that already have a password or were not created in Telegram", () => {
    expect(siteLoginHintDue(user({ completed: 1, hasPassword: true }), now)).toBe(false);
    expect(siteLoginHintDue(user({ completed: 1, telegram: false }), now)).toBe(false);
  });
});
