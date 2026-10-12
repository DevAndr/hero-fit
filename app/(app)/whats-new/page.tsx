import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ReleaseList } from "@/components/changelog/release-list";
import { requireUser } from "@/lib/auth/dal";
import { markChangelogSeen } from "@/lib/changelog/actions";
import { RELEASES } from "@/lib/changelog/releases";
import type { Release } from "@/lib/changelog/types";
import { hasUnseen, latestReleaseId, visibleRelease } from "@/lib/changelog/view";
import { enabledFlags } from "@/lib/flags/server";

export const metadata: Metadata = { title: "Что нового" };

/** «Что нового» в кабинете: пункты под флагом — по флагам пользователя; открытие снимает точку в меню. */
export default async function WhatsNewPage() {
  const user = await requireUser();
  const flags = new Set(await enabledFlags(user.id));
  const releases = RELEASES.map((r) => visibleRelease(r, { enabled: (f) => flags.has(f), publicOnly: false })).filter(
    (r): r is Release => r !== null,
  );
  const latest = latestReleaseId(RELEASES);
  if (latest && hasUnseen(RELEASES, user.changelogSeen)) await markChangelogSeen(user.id, latest);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Что нового" description="Что появилось и стало лучше в Hero Fit" />
      <ReleaseList releases={releases} />
    </div>
  );
}
