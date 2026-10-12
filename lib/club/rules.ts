import { z } from "zod";

/** Клубы залов (спека 2026-10-12-clubs-design): чистые правила. */

export const CLUB_ADMIN_MAX = 5;
export const CLUB_PENDING_MAX = 3;
export const CLUB_SEARCH_LIMIT = 30;
export const CLUB_RATING_TOP = 50;
export const CLUB_SIMILAR_MAX = 5;
export const CITY_SUGGESTIONS = 8;

/** Ключ для поиска и похожих: регистр, «ё», кавычки и пунктуация, пробелы. */
export function clubKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: не короче ${min} символов`).max(max, `${label}: не длиннее ${max} символов`);

export const clubEditSchema = z.object({
  name: text(3, 60, "Название"),
  city: text(2, 40, "Город"),
  address: text(5, 120, "Адрес"),
});

export const clubSchema = clubEditSchema.extend({
  contact: text(5, 120, "Контакт"),
  represent: z.literal(true, { error: "Подтвердите, что представляете этот зал" }),
});

export const rejectReasonSchema = text(5, 200, "Причина");

export type SimilarCandidate = { id: string; name: string; address: string; cityKey: string; nameKey: string; addressKey: string };

/** «Содержит» — только для ключей от 3 символов: иначе одна буква находит всё подряд. */
const MIN_PARTIAL = 3;
const overlaps = (a: string, b: string) =>
  a !== "" && b !== "" && (a === b || (Math.min(a.length, b.length) >= MIN_PARTIAL && (a.includes(b) || b.includes(a))));

/** Возможные дубли заявки: тот же город, название или адрес совпадает или содержит другое. */
export function similarClubs(input: { city: string; name: string; address: string }, clubs: SimilarCandidate[]): SimilarCandidate[] {
  const city = clubKey(input.city);
  const name = clubKey(input.name);
  const address = clubKey(input.address);
  return clubs
    .filter((c) => c.cityKey === city && (overlaps(c.nameKey, name) || overlaps(c.addressKey, address)))
    .slice(0, CLUB_SIMILAR_MAX);
}

export function createBlock({ admined, pending }: { admined: number; pending: number }): string | null {
  if (admined >= CLUB_ADMIN_MAX) return `Можно управлять не больше чем ${CLUB_ADMIN_MAX} клубами`;
  if (pending >= CLUB_PENDING_MAX) return `Не больше ${CLUB_PENDING_MAX} заявок на проверке`;
  return null;
}

/** "same" — уже в этом клубе, "nickname" — сначала ник, строка — отказ. */
export function joinBlock({ banned, hasNickname, sameClub }: { banned: boolean; hasNickname: boolean; sameClub: boolean }) {
  if (sameClub) return "same" as const;
  if (banned) return "Админ клуба ограничил вступление";
  if (!hasNickname) return "nickname" as const;
  return null;
}

export function transferBlock({
  selfId,
  targetId,
  targetIsMember,
  targetAdmined,
}: {
  selfId: string;
  targetId: string;
  targetIsMember: boolean;
  targetAdmined: number;
}): string | null {
  if (selfId === targetId) return "Клуб уже ваш";
  if (!targetIsMember) return "Передать можно только участнику клуба";
  if (targetAdmined >= CLUB_ADMIN_MAX) return `У него уже ${CLUB_ADMIN_MAX} клубов`;
  return null;
}

export function kickBlock({ adminId, targetId }: { adminId: string; targetId: string }): string | null {
  return adminId === targetId ? "Себя исключить нельзя" : null;
}

/** Шаблон ILIKE … ESCAPE '\': ввод ищется буквально. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
