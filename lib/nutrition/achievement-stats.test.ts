import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Флаг — только через клиент транзакции: глобальный кэш флагов на промахе берёт второе соединение из пула
vi.mock("@/lib/flags/server", () => ({
  isEnabled: () => {
    throw new Error("flag must be read through the transaction client");
  },
}));

import { nutritionStats } from "./achievement-stats";

const fail = () => {
  throw new Error("no queries expected");
};

describe("nutritionStats", () => {
  it("flag off — read through the transaction client, no diary queries", async () => {
    const client = new Proxy(
      { featureFlag: { findUnique: async () => ({ enabled: false, percent: 0, userIds: [] }) } },
      { get: (t, k) => (k in t ? t[k as keyof typeof t] : new Proxy(fail, { get: () => fail })) },
    );
    await expect(nutritionStats(client as never, "u1", "UTC")).resolves.toEqual({ enabled: false, longestDiaryStreak: 0, currentDiaryStreak: 0, normDays: 0 });
  });
});
