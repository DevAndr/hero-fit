import { describe, expect, it } from "vitest";
import { coinLabel, coinWord } from "@/lib/shop/labels";

describe("coinLabel", () => {
  it("подписи по причинам", () => {
    expect(coinLabel({ reason: "WORKOUT", key: "workout:w1", meta: { day: "2026-10-13" } })).toBe("Тренировка");
    expect(coinLabel({ reason: "RECORD", key: "record:w:e", meta: { exercise: "Присед" } })).toBe("Рекорд: Присед");
    expect(coinLabel({ reason: "RECORD", key: "record:w:e", meta: null })).toBe("Рекорд");
    expect(coinLabel({ reason: "BOSS_CHEST", key: "chest:boss:x", meta: null })).toBe("Сундук босса");
    expect(coinLabel({ reason: "DAILY_CHEST", key: "chest:daily:d", meta: null })).toBe("Ежедневный сундук");
    expect(coinLabel({ reason: "RAID_CHEST", key: "chest:raid:x", meta: null })).toBe("Сундук рейда");
    expect(coinLabel({ reason: "GOAL_CHEST", key: "chest:goal:x", meta: null })).toBe("Сундук цели");
    expect(coinLabel({ reason: "CLUB_TASK_CHEST", key: "chest:clubtask:x", meta: null })).toBe("Сундук задания клуба");
    expect(coinLabel({ reason: "ACHIEVEMENT", key: "ach:workouts:5", meta: { title: "Пять тренировок" } })).toBe("Ачивка: Пять тренировок");
    expect(coinLabel({ reason: "STREAK_WEEK", key: "streakw:2026-10-12", meta: null })).toBe("Неделя серии");
    expect(coinLabel({ reason: "LEVEL_UP", key: "level:7", meta: null })).toBe("Уровень 7");
    expect(coinLabel({ reason: "RETRO", key: "retro", meta: { level: 3 } })).toBe("Стартовый баланс");
  });
  it("покупка: название предмета или код", () => {
    expect(coinLabel({ reason: "PURCHASE", key: "buy:avatar:archer", meta: { code: "avatar:archer" } })).toBe("Покупка: Лучник");
    expect(coinLabel({ reason: "PURCHASE", key: "buy:unknown", meta: null })).toBe("Покупка: unknown");
  });
});

describe("coinWord", () => {
  it("склоняет по числу", () => {
    expect(coinWord(1)).toBe("монета");
    expect(coinWord(2)).toBe("монеты");
    expect(coinWord(5)).toBe("монет");
    expect(coinWord(11)).toBe("монет");
    expect(coinWord(21)).toBe("монета");
    expect(coinWord(0)).toBe("монет");
  });
});
