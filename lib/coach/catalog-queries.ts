import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CoachFormat } from "@/generated/prisma/enums";
import { ACTIVE_DAYS, CATALOG_PAGE_SIZE, cityKey, cityOptions, matchesFormat, sortCatalog, type CatalogFilter } from "@/lib/coach/catalog";
import type { Contacts } from "@/lib/coach/contacts";
import { db } from "@/lib/db";

const DAY = 86_400_000;

/** Сколько раз открывали контакты тренера за последние `days` дней (включая сегодня). */
export async function contactClicksForDays(coachId: string, days: number, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - (days - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const r = await db.coachContactClick.aggregate({ where: { coachId, day: { gte: since } }, _sum: { count: true } });
  return r._sum.count ?? 0;
}

/** Условия каталога в SQL (как inCatalog; город — после выборки, по cityKey). */
const IN_CATALOG = {
  catalogListed: true,
  publishedAt: { not: null },
  contactsConsentAt: { not: null },
  user: { isCoach: true, nickname: { not: null } },
  AND: [
    { OR: [{ telegram: { not: null } }, { whatsapp: { not: null } }, { vk: { not: null } }, { phone: { not: null } }, { email: { not: null } }] },
    { OR: [{ city: { not: null } }, { format: "ONLINE" }] },
  ],
} satisfies Prisma.CoachProfileWhereInput;

export type CatalogItem = {
  userId: string;
  nickname: string;
  name: string;
  city: string | null;
  format: CoachFormat;
  specialties: string[];
  about: string;
  contacts: Contacts;
  active: boolean;
};

/**
 * Страница каталога: условия и специализация — в SQL, город и формат — в памяти, затем порядок дня (sortCatalog).
 * Тренеров в каталоге немного — сортировка в памяти; вырастет — перенести порядок в SQL.
 */
export async function getCatalog(filter: CatalogFilter, now = new Date()): Promise<{ items: CatalogItem[]; total: number }> {
  const rows = await db.coachProfile.findMany({
    where: { ...IN_CATALOG, ...(filter.specialty ? { specialties: { has: filter.specialty } } : {}) },
    select: {
      userId: true,
      displayName: true,
      city: true,
      format: true,
      specialties: true,
      about: true,
      telegram: true,
      whatsapp: true,
      vk: true,
      phone: true,
      email: true,
      user: { select: { nickname: true } },
    },
  });
  const matched = rows.filter(
    (r) => (filter.city === null || (r.city !== null && cityKey(r.city) === filter.city)) && matchesFormat(r.format, filter.format),
  );
  const ids = matched.map((r) => r.userId);
  const since = new Date(now.getTime() - ACTIVE_DAYS * DAY);
  const [visits, links, programs] = await Promise.all([
    db.userVisit.findMany({ where: { userId: { in: ids }, day: { gte: since } }, distinct: ["userId"], select: { userId: true } }),
    db.coachLink.findMany({ where: { coachId: { in: ids }, endedAt: null }, distinct: ["coachId"], select: { coachId: true } }),
    db.coachProgram.findMany({ where: { coachId: { in: ids }, publishedAt: { not: null }, hiddenAt: null }, distinct: ["coachId"], select: { coachId: true } }),
  ]);
  const visited = new Set(visits.map((v) => v.userId));
  const working = new Set([...links, ...programs].map((x) => x.coachId));
  const items = sortCatalog(
    matched.map((r) => ({
      userId: r.userId,
      nickname: r.user.nickname!,
      name: r.displayName ?? r.user.nickname!,
      city: r.city,
      format: r.format,
      specialties: r.specialties,
      about: r.about,
      contacts: { telegram: r.telegram, whatsapp: r.whatsapp, vk: r.vk, phone: r.phone, email: r.email },
      active: visited.has(r.userId) && working.has(r.userId),
    })),
    now.toISOString().slice(0, 10),
  );
  const start = (filter.page - 1) * CATALOG_PAGE_SIZE;
  return { items: items.slice(start, start + CATALOG_PAGE_SIZE), total: items.length };
}

/** Города тренеров каталога для фильтра. */
export async function getCatalogCities(): Promise<{ key: string; label: string }[]> {
  const rows = await db.coachProfile.findMany({ where: { ...IN_CATALOG, city: { not: null } }, select: { city: true } });
  return cityOptions(rows.map((r) => r.city!));
}

/** Тренеров в каталоге — метрика админки. */
export async function catalogCount(): Promise<number> {
  return db.coachProfile.count({ where: IN_CATALOG });
}
