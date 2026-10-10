import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ProfileEditor } from "@/components/coach/profile-editor";
import { requireCoach } from "@/lib/coach/access";
import { MIN_CLIENTS_FOR_STATS, STAT_CODES, visibleStats, type StatCode } from "@/lib/coach/profile";
import { getCoachPublicStats } from "@/lib/coach/profile-queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Публичная страница" };

export default async function CoachProfilePage() {
  const coach = await requireCoach();
  const [user, profile, stats] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: coach.id }, select: { nickname: true } }),
    db.coachProfile.findUnique({ where: { userId: coach.id } }),
    getCoachPublicStats(coach.id),
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
        }}
        published={Boolean(profile?.publishedAt)}
        url={user.nickname ? new URL(`/trainer/${encodeURIComponent(user.nickname)}`, env.APP_URL).toString() : null}
        stats={notes}
      />
    </div>
  );
}
