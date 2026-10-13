import type { CoinReason } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { itemByCode } from "@/lib/shop/catalog";

/** «монета / монеты / монет» по числу (для «+N монет»). */
export function coinWord(n: number): string {
  return plural(n, "монета", "монеты", "монет");
}

const str = (meta: unknown, field: string): string | null => {
  const v = meta && typeof meta === "object" ? (meta as Record<string, unknown>)[field] : null;
  return typeof v === "string" && v ? v : null;
};

/** Подпись записи журнала монет. Неизвестный предмет (убран из каталога) — его код. */
export function coinLabel(tx: { reason: CoinReason; key: string; meta: unknown }): string {
  switch (tx.reason) {
    case "WORKOUT":
      return "Тренировка";
    case "RECORD": {
      const exercise = str(tx.meta, "exercise");
      return exercise ? `Рекорд: ${exercise}` : "Рекорд";
    }
    case "DAILY_CHEST":
      return "Ежедневный сундук";
    case "BOSS_CHEST":
      return "Сундук босса";
    case "RAID_CHEST":
      return "Сундук рейда";
    case "GOAL_CHEST":
      return "Сундук цели";
    case "CLUB_TASK_CHEST":
      return "Сундук задания клуба";
    case "ACHIEVEMENT": {
      const title = str(tx.meta, "title");
      return title ? `Ачивка: ${title}` : "Ачивка";
    }
    case "STREAK_WEEK":
      return "Неделя серии";
    case "LEVEL_UP":
      return `Уровень ${tx.key.replace(/^level:/, "")}`;
    case "RETRO":
      return "Стартовый баланс";
    case "PURCHASE": {
      const code = tx.key.replace(/^buy:/, "");
      return `Покупка: ${itemByCode(code)?.name ?? code}`;
    }
  }
}
