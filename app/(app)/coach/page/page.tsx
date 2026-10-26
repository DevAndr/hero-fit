import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ProfileEditor } from "@/components/coach/profile-editor";
import { requireCoach } from "@/lib/coach/access";
import { catalogMissing } from "@/lib/coach/catalog";
import { contactClicksForDays } from "@/lib/coach/catalog-queries";
import { MIN_CLIENTS_FOR_STATS, STAT_CODES, visibleStats, type StatCode } from "@/lib/coach/profile";
import { getCoachPublicStats } from "@/lib/coach/profile-queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Публичная страница" };

const EMPTY_PROFILE = {
  telegram: null,
  whatsapp: null,
  vk: null,
  phone: null,
  email: null,
  publishedAt: null,
  contactsConsentAt: null,
  catalogListed: false,
  city: null,
  format: "BOTH",
} as const;

export default async function CoachProfilePage() {
  const coach = await requireCoach();
  const [user, profile, stats, clicks30] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: coach.id }, select: { nickname: true } }),
    db.coachProfile.findUnique({ where: { userId: coach.id } }),
    getCoachPublicStats(coach.id),
    contactClicksForDays(coach.id, 30),
  ]);
  const shown = new Map(visibleStats(stats, []).map((s) => [s.code, `${s.value} ${s.label}`]));
  const notes = Object.fromEntries(
    STAT_CODES.map((code) => [
      code,
      shown.get(code) ??
        (code === "since" || code === "clients" ? "появится с первым клиентом" : `появится при ${MIN_CLIENTS_FOR_STATS}+ клиентах`),
    ]),
  ) as Record<StatCode, string>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Публичная страница" description="Расскажите о себе — клиенты придут по ссылке или из поиска" />
      <ProfileEditor
        initial={{
          displayName: profile?.displayName ?? "",
          city: profile?.city ?? "",
          format: profile?.format ?? "BOTH",
          specialties: profile?.specialties ?? [],
          about: profile?.about ?? "",
          hiddenStats: (profile?.hiddenStats ?? []) as StatCode[],
          showAwards: profile?.showAwards ?? true,
          telegram: profile?.telegram ?? "",
          whatsapp: profile?.whatsapp ?? "",
          vk: profile?.vk ?? "",
          phone: profile?.phone ?? "",
          email: profile?.email ?? "",
          contactsConsent: Boolean(profile?.contactsConsentAt),
          catalogListed: profile?.catalogListed ?? false,
          joinEnabled: profile?.joinEnabled ?? true,
        }}
        catalog={
{ missing: catalogMissing(profile ?? EMPTY_PROFILE, true), clicks30 }
        }
        published={Boolean(profile?.publishedAt)}
        url={user.nickname ? new URL(`/trainer/${encodeURIComponent(user.nickname)}`, env.APP_URL).toString() : null}
        stats={notes}
      />
    </div>
  );
}
