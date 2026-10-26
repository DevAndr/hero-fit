/** Системные оповещения: что показывать сейчас и в каком порядке (спека 2026-10-18-system-alerts-design). */

export type AlertKind = "BANNER" | "POPUP";
export type AlertTone = "INFO" | "WARNING" | "CRITICAL";
export type AlertDismiss = "NEVER" | "SESSION" | "FOREVER";
export type AlertAudience = "ALL" | "USERS" | "COACHES";

/** Видит ли оповещение пользователь: «пользователям» — без режима тренера, «тренерам» — с ним. */
export function audienceMatches(audience: AlertAudience, isCoach: boolean): boolean {
  return audience === "ALL" || (audience === "COACHES") === isCoach;
}

/** Оповещение для показа в кабинете; даты — ISO-строки (уходит в клиент). */
export type AlertView = {
  id: string;
  kind: AlertKind;
  tone: AlertTone;
  title: string | null;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  dismiss: AlertDismiss;
  startsAt: string;
  endsAt: string | null;
};

/** Строк одновременно, не больше. */
export const MAX_BANNERS = 3;

const TONE_RANK: Record<AlertTone, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

/** Идёт ли показ: начало включительно, конец — нет; без конца — пока не выключат. */
export function isLive(a: Pick<AlertView, "startsAt" | "endsAt">, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(a.startsAt) <= t && (a.endsAt == null || t < Date.parse(a.endsAt));
}

/** Сначала критичные, потом важные, потом инфо; внутри — новее выше. */
export function alertOrder(a: AlertView, b: AlertView): number {
  return TONE_RANK[a.tone] - TONE_RANK[b.tone] || Date.parse(b.startsAt) - Date.parse(a.startsAt);
}

function live(alerts: AlertView[], kind: AlertKind, now: Date, hidden: ReadonlySet<string>): AlertView[] {
  return alerts.filter((a) => a.kind === kind && !hidden.has(a.id) && isLive(a, now)).sort(alertOrder);
}

export function visibleBanners(alerts: AlertView[], now: Date, hidden: ReadonlySet<string>): AlertView[] {
  return live(alerts, "BANNER", now, hidden).slice(0, MAX_BANNERS);
}

/** Попапы — по одному: следующий появляется после закрытия предыдущего. */
export function nextPopup(alerts: AlertView[], now: Date, hidden: ReadonlySet<string>): AlertView | null {
  return live(alerts, "POPUP", now, hidden)[0] ?? null;
}

/** Ближайший будущий момент начала или конца — когда клиенту пересчитать показ. */
export function nextChange(alerts: AlertView[], now: Date): Date | null {
  const t = now.getTime();
  let next = Infinity;
  for (const a of alerts) {
    for (const s of [a.startsAt, a.endsAt]) {
      const ms = s == null ? NaN : Date.parse(s);
      if (ms > t && ms < next) next = ms;
    }
  }
  return next === Infinity ? null : new Date(next);
}

/** Ссылка кнопки: свой путь «/…» (не «//» и не «/\») или https с хостом — без javascript: и прочего. */
export function safeHref(href: string): boolean {
  // Пробелы и управляющие символы браузер выкидывает: «/\t/evil.com» стал бы «//evil.com»
  if (/[\x00-\x20\x7f]/.test(href)) return false;
  if (href.startsWith("/")) return !/^\/[/\\]/.test(href);
  try {
    const u = new URL(href);
    return u.protocol === "https:" && u.hostname !== "";
  } catch {
    return false;
  }
}
