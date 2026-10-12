import type { FlagKey } from "@/lib/flags/registry";
import type { ChangeItem, Release } from "./types";

/** Ссылки на публичной странице — только туда, куда пускают без входа. */
export function isPublicHref(href: string): boolean {
  return href === "/" || href.startsWith("/#") || href.startsWith("/tools/") || href === "/changelog" || href.startsWith("/changelog#");
}

/**
 * Релиз глазами смотрящего: пункты под выключенным флагом скрыты, пустые разделы — тоже, релиз без пунктов — null;
 * publicOnly — ссылки на закрытые страницы снимаются (пункт остаётся текстом).
 */
export function visibleRelease(r: Release, opts: { enabled: (flag: FlagKey) => boolean; publicOnly: boolean }): Release | null {
  const pick = (items: ChangeItem[] | undefined) =>
    (items ?? [])
      .filter((i) => !i.flag || opts.enabled(i.flag))
      .map((i) => (opts.publicOnly && i.href && !isPublicHref(i.href) ? { text: i.text, flag: i.flag } : i));
  const fresh = pick(r.new);
  const improved = pick(r.improved);
  const fixed = pick(r.fixed);
  if (!fresh.length && !improved.length && !fixed.length) return null;
  return {
    ...r,
    new: fresh,
    improved: improved.length ? improved : undefined,
    fixed: fixed.length ? fixed : undefined,
  };
}

export function latestReleaseId(releases: Release[]): string | null {
  return releases[0]?.id ?? null;
}

/** Есть релиз новее просмотренного: не смотрел, смотрел старый или id больше нет. */
export function hasUnseen(releases: Release[], seenId: string | null): boolean {
  const latest = latestReleaseId(releases);
  return latest !== null && seenId !== latest;
}

/** Плашка «Новое» на лендинге — для релизов не старше days дней. */
export function isRecent(release: Release, today: string, days = 60): boolean {
  const diff = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${release.date}T12:00:00Z`)) / 86_400_000;
  return diff <= days;
}
