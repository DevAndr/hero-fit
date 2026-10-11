/** Гильдии: правила состава, названия и значков (чистые функции). */
import { z } from "zod";

export const GUILD_MAX = 10;

/** Значки гильдии — код хранится в Guild.emblem, иконка — lib/guild/emblem.tsx. */
export const GUILD_EMBLEMS = [
  { code: "shield", label: "Щит" },
  { code: "sword", label: "Меч" },
  { code: "hammer", label: "Молот" },
  { code: "crown", label: "Корона" },
  { code: "flame", label: "Пламя" },
  { code: "paw", label: "Лапа" },
  { code: "skull", label: "Череп" },
  { code: "mountain", label: "Гора" },
  { code: "zap", label: "Молния" },
  { code: "anchor", label: "Якорь" },
  { code: "axe", label: "Топор" },
  { code: "star", label: "Звезда" },
] as const;

export const isEmblem = (code: string) => GUILD_EMBLEMS.some((e) => e.code === code);

export const guildNameSchema = z.string().trim().min(3, "Не короче 3 символов").max(24, "Не длиннее 24 символов");

/** Ключ уникальности названия: без учёта регистра, пробелы схлопнуты. */
export function guildKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Глава не уходит, пока в гильдии есть другие, — иначе гильдия останется без главы. */
export function leaveBlock(isLeader: boolean, members: number): string | null {
  return isLeader && members > 1 ? "Сначала передайте главенство" : null;
}

export type JoinBlock = "full" | "same" | "leader" | null;

/** Можно ли вступить: same — уже здесь, leader — глава другой гильдии с участниками, full — мест нет. */
export function joinBlock({
  members,
  inThis,
  current,
}: {
  members: number;
  inThis: boolean;
  current: { isLeader: boolean; members: number } | null;
}): JoinBlock {
  if (inThis) return "same";
  if (current && leaveBlock(current.isLeader, current.members)) return "leader";
  if (members >= GUILD_MAX) return "full";
  return null;
}
