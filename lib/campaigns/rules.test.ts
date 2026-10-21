import { describe, expect, it } from "vitest";
import {
  canEditCondition,
  conditionLabel,
  pickCampaigns,
  withinCap,
  type CampaignLite,
} from "./rules";

const c = (
  id: string,
  condition: CampaignLite["condition"],
  days: number | null,
  createdAt = new Date("2026-10-01"),
): CampaignLite => ({
  id,
  condition,
  days,
  createdAt,
});

describe("pickCampaigns", () => {
  it("берёт больший days", () => {
    const r = pickCampaigns(
      new Map([["u", [c("a", "INACTIVE", 3), c("b", "INACTIVE", 7)]]]),
    );
    expect(r.get("u")?.id).toBe("b");
  });
  it("STREAK_LOST выше всех", () => {
    const r = pickCampaigns(
      new Map([["u", [c("a", "INACTIVE", 14), c("s", "STREAK_LOST", null)]]]),
    );
    expect(r.get("u")?.id).toBe("s");
  });
  it("при равенстве — более ранний createdAt", () => {
    const r = pickCampaigns(
      new Map([
        [
          "u",
          [
            c("i", "INACTIVE", 5, new Date("2026-10-02")),
            c("n", "NO_WORKOUT", 5, new Date("2026-10-01")),
          ],
        ],
      ]),
    );
    expect(r.get("u")?.id).toBe("n");
  });
});

describe("withinCap", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it("пусто — можно", () => expect(withinCap([], now)).toBe(true));
  it("23 ч назад — нельзя", () =>
    expect(withinCap([ago(23)], now)).toBe(false));
  it("25 ч назад — можно", () => expect(withinCap([ago(25)], now)).toBe(true));
  it("три за 6 дней — нельзя", () =>
    expect(withinCap([ago(48), ago(96), ago(140)], now)).toBe(false));
  it("одна из трёх 8 дней назад — можно", () =>
    expect(withinCap([ago(48), ago(96), ago(192)], now)).toBe(true));
});

describe("conditionLabel", () => {
  it("склоняет дни", () => {
    expect(conditionLabel("INACTIVE", 3)).toBe("Не заходил 3 дня");
    expect(conditionLabel("INACTIVE", 5)).toBe("Не заходил 5 дней");
    expect(conditionLabel("INACTIVE", 1)).toBe("Не заходил 1 день");
    expect(conditionLabel("NO_WORKOUT", 7)).toBe("Не тренировался 7 дней");
    expect(conditionLabel("NEVER_TRAINED", 2)).toBe(
      "Зарегистрировался и не тренировался 2 дня",
    );
    expect(conditionLabel("STREAK_LOST", null)).toBe("Серия сгорела");
  });
});

describe("canEditCondition", () => {
  it("только черновик и пауза", () => {
    expect(canEditCondition("DRAFT")).toBe(true);
    expect(canEditCondition("PAUSED")).toBe(true);
    expect(canEditCondition("ACTIVE")).toBe(false);
    expect(canEditCondition("ARCHIVED")).toBe(false);
  });
});
