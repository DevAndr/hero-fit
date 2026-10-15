import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn(async () => { throw new Error("db is down"); }) },
}));

import { recordError } from "./record";

afterEach(() => vi.restoreAllMocks());

describe("recordError", () => {
  it("never throws: a broken database returns null and logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = { source: "SERVER" as const, message: "boom", stack: null, path: "/x", version: "0.7.0", userAgent: null, userId: null };
    await expect(recordError(input)).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
  });
});
