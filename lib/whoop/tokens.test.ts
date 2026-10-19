import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ env: {} }));

import { hasScope } from "./scopes";
import { parseTokenResponse, WhoopUnavailableError } from "./tokens";

const base = { access_token: "a", refresh_token: "r", expires_in: 60 };

describe("parseTokenResponse", () => {
  it("возвращает scope строкой", () => {
    expect(parseTokenResponse({ ...base, scope: "read:sleep offline" }).scope).toBe("read:sleep offline");
  });

  it("без scope или с нестроковым — null", () => {
    expect(parseTokenResponse(base).scope).toBeNull();
    expect(parseTokenResponse({ ...base, scope: 5 }).scope).toBeNull();
  });

  it("без токена бросает WhoopUnavailableError", () => {
    expect(() => parseTokenResponse({ refresh_token: "r", expires_in: 60 })).toThrow(WhoopUnavailableError);
    expect(() => parseTokenResponse(null)).toThrow(WhoopUnavailableError);
  });
});

describe("hasScope", () => {
  it("ищет целое слово", () => {
    expect(hasScope("read:workout read:sleep", "read:sleep")).toBe(true);
    expect(hasScope("read:sleepy", "read:sleep")).toBe(false);
    expect(hasScope("", "read:sleep")).toBe(false);
  });
});
