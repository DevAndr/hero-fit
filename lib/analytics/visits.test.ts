import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { executeRaw } = vi.hoisted(() => ({ executeRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $executeRaw: executeRaw } }));

import { hourFloor, recordFirstVisit, recordUtmVisit } from "./visits";

afterEach(() => {
  vi.restoreAllMocks();
  executeRaw.mockReset();
});

describe("hourFloor", () => {
  it("начало часа UTC", () => {
    expect(hourFloor(new Date("2026-10-23T14:37:12.345Z")).toISOString()).toBe("2026-10-23T14:00:00.000Z");
  });
});

describe("recordFirstVisit", () => {
  it("одна запись upsert", async () => {
    executeRaw.mockResolvedValue(1);
    await recordFirstVisit("home", "search");
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("сломанная база не бросает, ошибка в логе", async () => {
    executeRaw.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordFirstVisit("home", "search")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});

describe("recordUtmVisit", () => {
  it("сломанная база не бросает, ошибка в логе", async () => {
    executeRaw.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordUtmVisit({ source: "blogger", campaign: null })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
