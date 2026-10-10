import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookie-options";

describe("authCookieOptions", () => {
  it("Mini App — для фрейма web.telegram.org", () => {
    expect(authCookieOptions({ embedded: true, production: false, maxAge: 900 })).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      partitioned: true,
      maxAge: 900,
    });
  });
  it("обычная сессия — как раньше", () => {
    expect(authCookieOptions({ embedded: false, production: true, maxAge: 60 })).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
      maxAge: 60,
    });
    expect(authCookieOptions({ embedded: false, production: false, maxAge: 60 }).secure).toBe(false);
  });
});
