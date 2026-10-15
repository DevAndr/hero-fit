import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: transaction } }));

import { recordError } from "./record";

afterEach(() => vi.restoreAllMocks());

describe("recordError", () => {
  it("never throws: a broken database returns null and logs", async () => {
    transaction.mockImplementationOnce(async () => {
      throw new Error("db is down");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = { source: "SERVER" as const, message: "boom", stack: null, path: "/x", version: "0.7.0", userAgent: null, userId: null };
    await expect(recordError(input)).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
  });
});

describe("recordError canCreate", () => {
  it("a new group is not created when canCreate says no; an existing one is still counted", async () => {
    const upsert = vi.fn(async () => ({ id: "g", alertedAt: null }));
    const tx = { errorGroup: { findUnique: vi.fn(async () => null), upsert }, errorEvent: { create: vi.fn() }, $executeRaw: vi.fn() };
    transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
    const input = { source: "CLIENT" as const, message: "boom", stack: null, path: null, version: null, userAgent: null, userId: null };
    await expect(recordError(input, undefined, { canCreate: () => false })).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    tx.errorGroup.findUnique.mockImplementation(async () => ({ resolvedAt: null }) as never);
    await expect(recordError(input, undefined, { canCreate: () => false })).resolves.toMatchObject({ groupId: "g", isNew: false });
  });
});
