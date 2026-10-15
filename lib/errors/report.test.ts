import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { recordError } = vi.hoisted(() => ({ recordError: vi.fn<(input: unknown) => Promise<null>>(async () => null) }));
vi.mock("@/lib/errors/record", () => ({ recordError }));
const { notifyAdmins, updateMany } = vi.hoisted(() => ({
  notifyAdmins: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 })),
}));
vi.mock("@/lib/errors/notify", () => ({ notifyAdmins, alertsLastHour: () => 0, markAlert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { errorGroup: { updateMany } } }));
vi.mock("@/lib/auth/cookies", () => ({ ACCESS_COOKIE: "hf_at" }));
vi.mock("@/lib/auth/tokens", () => ({ verifyAccessToken: vi.fn(async (t?: string) => (t === "good" ? { userId: "u1", sessionId: "s" } : null)) }));

import { reportError, reportServerError } from "./report";

const req = (path: string, headers: Record<string, string> = {}) => ({ path, method: "GET", headers });

beforeEach(() => {
  recordError.mockReset();
  recordError.mockImplementation(async () => null);
  notifyAdmins.mockClear();
  updateMany.mockReset();
  updateMany.mockImplementation(async () => ({ count: 1 }));
});

const input = (source: "SERVER" | "CLIENT" = "SERVER") => ({ source, message: "boom", stack: null, path: "/a", version: null, userAgent: null, userId: null });
const recorded = { groupId: "g1", isNew: true, reopened: false, alertedAt: null };

describe("reportServerError", () => {
  it.each(["NEXT_REDIRECT;replace;/login;307;", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK;404"])("skips Next control flow %s", async (digest) => {
    await reportServerError(Object.assign(new Error("x"), { digest }), req("/a"));
    expect(recordError).not.toHaveBeenCalled();
  });

  it("records a real error without the query string, with the user from the access cookie", async () => {
    await reportServerError(new Error("boom"), req("/reset-password?token=secret", { cookie: "a=1; hf_at=good", "user-agent": "UA" }));
    expect(recordError).toHaveBeenCalledWith(
      expect.objectContaining({ source: "SERVER", message: "boom", path: "/reset-password", userId: "u1", userAgent: "UA" }),
      undefined,
      {},
    );
  });

  it("non-Error values are recorded as strings", async () => {
    await reportServerError("plain", req("/a"));
    expect(recordError).toHaveBeenCalledWith(expect.objectContaining({ message: "plain", stack: null, userId: null }), undefined, {});
  });
});

describe("reportError", () => {
  it("alerts only when it wins the atomic alert claim (concurrent duplicates send one message)", async () => {
    recordError.mockImplementation(async () => recorded as never);
    updateMany.mockImplementationOnce(async () => ({ count: 0 }));
    await reportError(input());
    expect(notifyAdmins).not.toHaveBeenCalled();
    await reportError(input());
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "g1", OR: expect.any(Array) }) }),
    );
  });

  it("at most two writes at a time — a burst does not take the whole connection pool", async () => {
    let release!: () => void;
    const gate = new Promise<null>((r) => (release = () => r(null)));
    recordError.mockImplementation(() => gate);
    const all = [reportError(input()), reportError(input()), reportError(input())];
    expect(recordError).toHaveBeenCalledTimes(2);
    release();
    await Promise.all(all);
  });

  it("browser reports may create new groups only under the hourly cap; server ones always", async () => {
    await reportError(input("CLIENT"));
    expect(recordError).toHaveBeenLastCalledWith(expect.anything(), undefined, expect.objectContaining({ canCreate: expect.any(Function) }));
    await reportError(input("SERVER"));
    expect(recordError).toHaveBeenLastCalledWith(expect.anything(), undefined, {});
  });
});
