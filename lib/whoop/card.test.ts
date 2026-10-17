import { describe, expect, it } from "vitest";
import { cardState, outsideHistory, WHOOP_HISTORY_MS } from "./card";
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

describe("outsideHistory", () => {
  const connectedAt = new Date("2026-10-10T10:00:00Z");
  const daysBefore = (d: number) => new Date(connectedAt.getTime() - d * 24 * H);

  it("история грузится за 30 дней", () => {
    expect(WHOOP_HISTORY_MS).toBe(30 * 24 * H);
  });

  it("тренировка старше загруженной истории без активностей — карточки нет", () => {
    expect(outsideHistory(daysBefore(40), connectedAt, 0)).toBe(true);
  });

  it("в пределах истории или есть активности — карточка есть", () => {
    expect(outsideHistory(daysBefore(29), connectedAt, 0)).toBe(false);
    expect(outsideHistory(daysBefore(40), connectedAt, 1)).toBe(false);
  });
});
