import { z } from "zod";
import { hasContacts, type Contacts } from "@/lib/coach/contacts";
import { SPECIALTIES } from "@/lib/coach/profile";

/** Каталог тренеров `/trainers`: кто в нём, фильтры и порядок (чистые). */

export const CATALOG_PAGE_SIZE = 20;
/** «Активный» тренер — входил за последние N дней. */
export const ACTIVE_DAYS = 14;
export const ABOUT_PREVIEW = 140;
/** От стольких тренеров каталог рекламируем и индексируем: кнопка на лендинге и `index` у /trainers (пустой — тонкая страница). */
export const CATALOG_LANDING_MIN = 5;

export function showCatalogOnLanding(coachesInCatalog: number): boolean {
  return coachesInCatalog >= CATALOG_LANDING_MIN;
}

export function catalogIndexable(coachesInCatalog: number): boolean {
  return coachesInCatalog >= CATALOG_LANDING_MIN;
}

type Format = "ONLINE" | "OFFLINE" | "BOTH";

export type CatalogProfile = Contacts & {
  publishedAt: Date | null;
  contactsConsentAt: Date | null;
  catalogListed: boolean;
  city: string | null;
  format: Format;
};

/** Контакты видны вошедшим: тренер согласился и указал хотя бы один. */
export function contactsVisible(p: CatalogProfile): boolean {
  return p.contactsConsentAt !== null && hasContacts(p);
}

export function catalogMissing(p: CatalogProfile, isCoach: boolean): string[] {
  if (!isCoach) return ["включите режим тренера"];
  const missing: string[] = [];
  if (!p.catalogListed) missing.push("включите показ в каталоге");
  if (!p.publishedAt) missing.push("опубликуйте страницу");
  if (!hasContacts(p)) missing.push("укажите хотя бы один контакт");
  if (!p.contactsConsentAt) missing.push("отметьте согласие на показ контактов");
  if (!p.city?.trim() && p.format !== "ONLINE") missing.push("укажите город");
  return missing;
}

export function inCatalog(p: CatalogProfile, isCoach: boolean): boolean {
  return catalogMissing(p, isCoach).length === 0;
}

/** Считать ли открытие контактов: не сам тренер, контакты видны, страница опубликована (каталог не обязателен — есть и на странице тренера). */
export function canCountClick(p: CatalogProfile, isCoach: boolean, viewerId: string, coachId: string): boolean {
  return viewerId !== coachId && isCoach && p.publishedAt !== null && contactsVisible(p);
}

export function cityKey(city: string): string {
  return city.trim().toLowerCase().replaceAll("ё", "е");
}

/** Города для фильтра: одно (первое) написание на город, по алфавиту. */
export function cityOptions(cities: string[]): { key: string; label: string }[] {
  const byKey = new Map<string, string>();
  for (const c of cities) {
    const key = cityKey(c);
    if (key && !byKey.has(key)) byKey.set(key, c.trim());
  }
  return [...byKey].map(([key, label]) => ({ key, label })).sort((a, b) => a.key.localeCompare(b.key, "ru"));
}

export function matchesFormat(format: Format, wanted: "ONLINE" | "OFFLINE" | null): boolean {
  return wanted === null || format === wanted || format === "BOTH";
}

const orNull = <T extends z.ZodType>(schema: T) => schema.nullish().catch(null).transform((v) => v ?? null);

export const catalogFilterSchema = z.object({
  city: orNull(z.string().transform((v) => cityKey(v) || null)),
  format: orNull(z.enum(["ONLINE", "OFFLINE"])),
  specialty: orNull(z.string().refine((c) => c in SPECIALTIES)),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});
export type CatalogFilter = z.output<typeof catalogFilterSchema>;

/** FNV-1a 32 бит — стабильное «перемешивание» на день. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Активные выше; внутри групп — порядок дня `day` (YYYY-MM-DD), одинаковый у всех. */
export function sortCatalog<T extends { userId: string; active: boolean }>(items: T[], day: string): T[] {
  return items
    .map((item) => ({ item, key: hash(item.userId + day) }))
    .sort((a, b) => Number(b.item.active) - Number(a.item.active) || a.key - b.key)
    .map((x) => x.item);
}

export function aboutPreview(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= ABOUT_PREVIEW) return t;
  const cut = t.slice(0, ABOUT_PREVIEW);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?—-]+$/, "")}…`;
}
