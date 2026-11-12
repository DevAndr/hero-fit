import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findMany: vi.fn(),
  createMany: vi.fn(),
  queryRaw: vi.fn(),
}));
const client = vi.hoisted(() => ({
  bossWeek: { findUnique: m.findUnique, findUniqueOrThrow: m.findUniqueOrThrow, findMany: m.findMany, createMany: m.createMany },
  $queryRaw: m.queryRaw,
}));
vi.mock("@/lib/db", () => ({ db: client }));
vi.mock("@/lib/flags/server", () => ({ isEnabled: m.isEnabled }));

import { bossForWeek } from "./bosses";
import { getBestiary, getOrCreateBossWeek } from "./queries";

const SEASON = "2026-12-28";
const USUAL = "2026-11-09";
const row = (week: string, bossCode: string) => ({ id: "bw1", userId: "u1", week, bossCode, hp: 1000, defeatedAt: null, rewardOpenedAt: null });

beforeEach(() => {
  vi.clearAllMocks();
  m.queryRaw.mockResolvedValue([]);
  m.findUnique.mockResolvedValue(null);
  m.findUniqueOrThrow.mockImplementation(async () => row(SEASON, "grinch"));
  m.findMany.mockResolvedValue([]);
  m.isEnabled.mockResolvedValue(true);
});

const createdCode = () => m.createMany.mock.calls[0][0].data[0].bossCode;

describe("getOrCreateBossWeek", () => {
  it("новогодняя неделя с флагом — Гринч", async () => {
    await getOrCreateBossWeek(client as never, "u1", SEASON, "UTC");
    expect(m.isEnabled).toHaveBeenCalledWith("seasonal_boss", "u1");
    expect(createdCode()).toBe("grinch");
  });

  it("новогодняя неделя без флага — босс ротации", async () => {
    m.isEnabled.mockResolvedValue(false);
    await getOrCreateBossWeek(client as never, "u1", SEASON, "UTC");
    expect(createdCode()).toBe(bossForWeek(SEASON));
  });

  it("строка недели уже есть — не меняется, флаг не читается", async () => {
    const existing = row(SEASON, bossForWeek(SEASON));
    m.findUnique.mockResolvedValue(existing);
    await expect(getOrCreateBossWeek(client as never, "u1", SEASON, "UTC")).resolves.toBe(existing);
    expect(m.createMany).not.toHaveBeenCalled();
    expect(m.isEnabled).not.toHaveBeenCalled();
  });

  it("обычная неделя — флаг не читается, босс ротации", async () => {
    await getOrCreateBossWeek(client as never, "u1", USUAL, "UTC");
    expect(m.isEnabled).not.toHaveBeenCalled();
    expect(createdCode()).toBe(bossForWeek(USUAL));
  });
});

describe("getBestiary: босс на арене сейчас", () => {
  const now = new Date(`${SEASON}T12:00:00Z`);

  it("строка текущей недели с Гринчем — «сейчас» у Гринча, ни у одного из 12", async () => {
    m.findMany.mockResolvedValue([{ week: SEASON, bossCode: "grinch", defeatedAt: null }]);
    const { entries, seasonal } = await getBestiary("u1", "UTC", now);
    expect(seasonal[0].current).toBe(true);
    expect(entries.every((e) => e.weeksUntil > 0)).toBe(true);
    expect(entries.find((e) => e.code === bossForWeek(SEASON))!.weeksUntil).toBe(12);
    expect(m.isEnabled).not.toHaveBeenCalled();
  });

  it("строки текущей недели нет — по дате и флагу", async () => {
    const { entries, seasonal } = await getBestiary("u1", "UTC", now);
    expect(m.isEnabled).toHaveBeenCalledWith("seasonal_boss", "u1");
    expect(seasonal[0].current).toBe(true);
    expect(entries.every((e) => e.weeksUntil > 0)).toBe(true);
  });

  it("строки нет, флаг выключен — на арене босс ротации", async () => {
    m.isEnabled.mockResolvedValue(false);
    const { entries, seasonal } = await getBestiary("u1", "UTC", now);
    expect(seasonal[0].current).toBe(false);
    expect(entries.find((e) => e.code === bossForWeek(SEASON))!.weeksUntil).toBe(0);
  });

  it("строка текущей недели — босс ротации (флаг включили позже) — он и на арене", async () => {
    m.findMany.mockResolvedValue([{ week: SEASON, bossCode: bossForWeek(SEASON), defeatedAt: null }]);
    const { entries, seasonal } = await getBestiary("u1", "UTC", now);
    expect(seasonal[0].current).toBe(false);
    expect(entries.find((e) => e.code === bossForWeek(SEASON))!.weeksUntil).toBe(0);
    expect(m.isEnabled).not.toHaveBeenCalled();
  });
});
