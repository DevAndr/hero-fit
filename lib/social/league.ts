import { randomInt } from "node:crypto";
import { z } from "zod";

/** Публичный ник: 3–20 символов, буквы (в т.ч. кириллица), цифры, «_», «-», «.»; без пробелов. */
export const nicknameSchema = z
  .string()
  .trim()
  .min(3, "Ник — минимум 3 символа")
  .max(20, "Ник — максимум 20 символов")
  .regex(/^[\p{L}\p{N}_.-]+$/u, "Только буквы, цифры, «_», «-» и «.»");

export const nicknameKey = (nickname: string) => nickname.trim().toLocaleLowerCase("ru-RU");

/** Без похожих символов (0/O, 1/I/L) — код диктуют голосом и вводят руками. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const FRIEND_CODE_LENGTH = 8;

export function generateFriendCode() {
  return Array.from({ length: FRIEND_CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Код из ввода пользователя или из ссылки: регистр и пробелы/дефисы не важны. */
export function normalizeFriendCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === FRIEND_CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export type LeagueMember = {
  id: string;
  nickname: string;
  level: number;
  streak: number;
  xp: number;
  workouts: number;
  /** Босс этой недели повержен (неделя — по поясу смотрящего). */
  bossDefeated?: boolean;
};

export type RankedMember = LeagueMember & { place: number; me: boolean };

/**
 * Места в лиге: больше XP — выше; при равенстве — больше тренировок; дальше по нику.
 * Одинаковые XP и тренировки — одно место (1, 2, 2, 4).
 */
export function rankLeague(members: LeagueMember[], meId: string): RankedMember[] {
  const sorted = [...members].sort(
    (a, b) => b.xp - a.xp || b.workouts - a.workouts || a.nickname.localeCompare(b.nickname, "ru"),
  );
  let place = 0;
  return sorted.map((m, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.xp !== m.xp || prev.workouts !== m.workouts) place = i + 1;
    return { ...m, place, me: m.id === meId };
  });
}

/** Минимум активных атлетов, при котором процентиль имеет смысл (и не раскрывает чужие результаты). */
export const MIN_PERCENTILE_POPULATION = 10;

/**
 * Доля остальных активных атлетов, у кого XP за неделю строго меньше, чем у меня (0–100).
 * null — если атлетов слишком мало.
 */
export function percentile(below: number, others: number): number | null {
  if (others + 1 < MIN_PERCENTILE_POPULATION) return null;
  return Math.round((below / others) * 100);
}
