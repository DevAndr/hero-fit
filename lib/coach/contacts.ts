import { z } from "zod";

/** Контакты тренера (каталог тренеров): нормализация ввода и ссылки только из нормализованных значений (чистые). */

export const CONTACT_KINDS = ["telegram", "whatsapp", "vk", "phone", "email"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export type Contacts = Record<ContactKind, string | null>;

export const CONTACT_LABELS: Record<ContactKind, string> = { telegram: "Telegram", whatsapp: "WhatsApp", vk: "VK", phone: "Телефон", email: "Email" };

/** Адрес без схемы, хоста и хвоста: «https://t.me/nick/?x» → «nick». */
const stripUrl = (v: string, hosts: RegExp) => v.replace(/^https?:\/\//i, "").replace(hosts, "").replace(/[/?#].*$/, "");

/** Необязательная строка: пусто → null, иначе normalize и проверка. */
const handle = (normalize: (v: string) => string, valid: (v: string) => boolean, message: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? normalize(v.trim()) : null))
    .refine((v) => v === null || valid(v), message);

const matches = (re: RegExp) => (v: string) => re.test(v);

/** Номер: только цифры с «+»; российский «8XXXXXXXXXX» → «+7XXXXXXXXXX». */
function normalizePhone(v: string): string {
  if (/[^\d\s()+-]/.test(v)) return v;
  let digits = v.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return `+${digits}`;
}

const phone = handle(normalizePhone, matches(/^\+\d{10,15}$/), "Проверьте номер");

export const contactsSchema = z.object({
  telegram: handle((v) => stripUrl(v, /^(www\.)?(t|telegram)\.me\//i).replace(/^@/, ""), matches(/^[A-Za-z0-9_]{5,32}$/), "Проверьте ник в Telegram"),
  whatsapp: phone,
  vk: handle((v) => stripUrl(v, /^(m\.)?vk\.(com|ru)\//i), matches(/^[A-Za-z0-9_.]{2,32}$/), "Проверьте адрес VK"),
  phone,
  email: handle((v) => v.toLowerCase(), (v) => v.length <= 254 && z.email().safeParse(v).success, "Проверьте email"),
});

/** +79991234567 → «+7 999 123-45-67»; другие страны — как хранятся. */
function formatPhone(p: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : p;
}

const LINK: Record<ContactKind, (v: string) => { text: string; href: string }> = {
  telegram: (v) => ({ text: `@${v}`, href: `https://t.me/${v}` }),
  whatsapp: (v) => ({ text: formatPhone(v), href: `https://wa.me/${v.slice(1)}` }),
  vk: (v) => ({ text: `vk.com/${v}`, href: `https://vk.com/${v}` }),
  phone: (v) => ({ text: formatPhone(v), href: `tel:${v}` }),
  email: (v) => ({ text: v, href: `mailto:${v}` }),
};

export function contactLinks(c: Contacts): { kind: ContactKind; label: string; text: string; href: string }[] {
  return CONTACT_KINDS.flatMap((kind) => {
    const v = c[kind];
    return v ? [{ kind, label: CONTACT_LABELS[kind], ...LINK[kind](v) }] : [];
  });
}

export function hasContacts(c: Contacts): boolean {
  return CONTACT_KINDS.some((k) => Boolean(c[k]));
}
