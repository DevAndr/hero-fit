import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { recordError } = vi.hoisted(() => ({ recordError: vi.fn<(input: unknown) => Promise<null>>(async () => null) }));
vi.mock("@/lib/errors/record", () => ({ recordError }));
vi.mock("@/lib/errors/notify", () => ({ notifyAdmins: vi.fn(async () => {}), alertsLastHour: () => 0, markAlert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { errorGroup: { update: vi.fn() } } }));
vi.mock("@/lib/auth/cookies", () => ({ ACCESS_COOKIE: "hf_at" }));
vi.mock("@/lib/auth/tokens", () => ({ verifyAccessToken: vi.fn(async (t?: string) => (t === "good" ? { userId: "u1", sessionId: "s" } : null)) }));

import { reportServerError } from "./report";

const req = (path: string, headers: Record<string, string> = {}) => ({ path, method: "GET", headers });

beforeEach(() => recordError.mockClear());

describe("reportServerError", () => {
  it.each(["NEXT_REDIRECT;replace;/login;307;", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK;404"])("skips Next control flow %s", async (digest) => {
    await reportServerError(Object.assign(new Error("x"), { digest }), req("/a"));
    expect(recordError).not.toHaveBeenCalled();
  });

  it("records a real error without the query string, with the user from the access cookie", async () => {
    await reportServerError(new Error("boom"), req("/reset-password?token=secret", { cookie: "a=1; hf_at=good", "user-agent": "UA" }));
    expect(recordError).toHaveBeenCalledWith(
      expect.objectContaining({ source: "SERVER", message: "boom", path: "/reset-password", userId: "u1", userAgent: "UA" }),
    );
  });

  it("non-Error values are recorded as strings", async () => {
    await reportServerError("plain", req("/a"));
    expect(recordError).toHaveBeenCalledWith(expect.objectContaining({ message: "plain", stack: null, userId: null }));
  });
});
