import { z } from "zod";
import type { ClubStatus } from "@/generated/prisma/client";
import { plural } from "@/lib/format";

/** Публичная страница клуба (спека 2026-10-12-club-public-page-design) — чистые правила. */

export const CLUB_ABOUT_MIN = 50;
export const CLUB_ABOUT_MAX = 1000;
/** Цифры клуба на публичной странице — от стольких участников (меньше — сумма выдаёт конкретного человека). */
export const MIN_MEMBERS_FOR_STATS = 3;
export const UNPUBLISH_REASON_MAX = 200;
const SLUG_MAX = 60;
const NUMBERED_MAX = 20;

export const aboutSchema = z.string().trim().max(CLUB_ABOUT_MAX, `Не больше ${CLUB_ABOUT_MAX} символов`);

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Транслит для адреса страницы: «Железный Зал» → `zheleznyy-zal`; пусто → `club` (для города — `city`). */
export function slugify(text: string, fallback: "club" | "city" = "club"): string {
  const latin = [...text.toLowerCase().replace(/ё/g, "е")].map((ch) => TRANSLIT[ch] ?? ch).join("");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  return slug || fallback;
}

const STREET_PREFIX = /^(ул\.?|улица|пр-т|пр\.|проспект|д\.)\s*/i;

/** Варианты адреса по порядку: название, название + улица, затем `-2` … `-20`. */
export function slugCandidates(name: string, address: string): string[] {
  const base = slugify(name);
  const street = address.split(",")[0].trim().replace(STREET_PREFIX, "").trim();
  // От готового base: у названия без букв вариант с улицей — `club-pushkina`, а не просто `pushkina`
  const withStreet = street ? slugify(`${base} ${street}`) : null;
  const numbered = Array.from({ length: NUMBERED_MAX - 1 }, (_, i) => `${base}-${i + 2}`);
  return [...new Set([base, ...(withStreet ? [withStreet] : []), ...numbered])];
}

/** Почему нельзя опубликовать; null — можно. */
export function canPublish(c: { status: ClubStatus; about: string }): string | null {
  if (c.status === "PENDING") return "Клуб ещё на проверке";
  if (c.status === "HIDDEN") return "Клуб скрыт модератором";
  if (c.status === "REJECTED") return "Заявка отклонена";
  if (c.about.trim().length < CLUB_ABOUT_MIN) return `Напишите о зале хотя бы ${CLUB_ABOUT_MIN} символов`;
  return null;
}

export type ClubPublicStats = { members: number; week: number; month: number; monthSec: number };
export type ClubStat = { code: "members" | "week" | "month" | "hours"; value: string; label: string };

/** Цифры на странице: при < 3 участниках — только их число. */
export function visibleClubStats(s: ClubPublicStats): ClubStat[] {
  const members: ClubStat = { code: "members", value: String(s.members), label: plural(s.members, "участник", "участника", "участников") };
  if (s.members < MIN_MEMBERS_FOR_STATS) return [members];
  const hours = Math.round(s.monthSec / 3600);
  return [
    members,
    { code: "week", value: String(s.week), label: `${plural(s.week, "тренировка", "тренировки", "тренировок")} за неделю` },
    { code: "month", value: String(s.month), label: `${plural(s.month, "тренировка", "тренировки", "тренировок")} за 30 дней` },
    { code: "hours", value: String(hours), label: `${plural(hours, "час", "часа", "часов")} в зале за 30 дней` },
  ];
}

/**
 * Кто видит страницу: всем — одобренный, опубликованный и флаг `clubs` на 100 %; админу клуба и приложения —
 * предпросмотр одобренного, если страница публиковалась хоть раз; скрытый и отклонённый — никому.
 */
export function clubPageAccess(a: {
  status: ClubStatus;
  publishedAt: Date | null;
  slug: string | null;
  flagFull: boolean;
  canManage: boolean;
}): "open" | "preview" | "none" {
  if (a.status !== "APPROVED" || !a.slug) return "none";
  if (a.publishedAt && a.flagFull) return "open";
  return a.canManage ? "preview" : "none";
}

export const clubPath = (citySlug: string, slug: string) => `/gym/${citySlug}/${slug}`;
export const cityPath = (citySlug: string) => `/gym/${citySlug}`;
