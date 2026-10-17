import { describe, expect, it } from "vitest";
import { cardState } from "./card";
import type { WhoopSummary } from "./match";

const H = 3_600_000;
const finishedAt = new Date("2026-10-10T10:00:00Z");
const at = (hours: number) => new Date(finishedAt.getTime() + hours * H);
const summary: WhoopSummary = { avgHr: 140, maxHr: 172, strain: 12.3, kcal: 359, zonesMs: [0, 0, 0, 0, 0, 0], fragments: 1 };

describe("cardState", () => {
  it("переподключение важнее данных", () => {
    expect(cardState({ kind: "data", summary }, finishedAt, at(1), true)).toEqual({ kind: "reauth" });
    expect(cardState(null, finishedAt, at(1), true)).toEqual({ kind: "reauth" });
  });

  it("данные и обработка — как есть", () => {
    expect(cardState({ kind: "data", summary }, finishedAt, at(100), false)).toEqual({ kind: "data", summary });
    expect(cardState({ kind: "pending" }, finishedAt, at(100), false)).toEqual({ kind: "pending" });
  });

  it("нет совпадения: до 48 ч — ждём, позже — не записал", () => {
    expect(cardState(null, finishedAt, at(47), false)).toEqual({ kind: "waiting" });
    expect(cardState(null, finishedAt, at(49), false)).toEqual({ kind: "none" });
  });
});
