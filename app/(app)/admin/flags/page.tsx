import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { FlagCard, StaleFlag } from "@/components/flags/flag-card";
import { requireAdmin } from "@/lib/auth/admin";
import { getFlagsAdmin } from "@/lib/flags/server";

export const metadata: Metadata = { title: "Флаги" };

/** Фича-флаги: раскатка новых фич и kill switch (только ADMIN_LOGINS, остальным — 404). */
export default async function FlagsPage() {
  await requireAdmin();
  const { flags, stale } = await getFlagsAdmin();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Флаги" description="Раскатка новых фич: себе → процент → всем. Выключение действует сразу для всех." />
      {flags.map((f) => (
        <FlagCard key={f.key} flag={f} />
      ))}
      {stale.length ? (
        <section aria-label="Устаревшие" className="space-y-2 rounded-xl border border-dashed p-4">
          <h2 className="font-bold">Устаревшие</h2>
          <p className="text-sm text-muted-foreground">Строки в базе для флагов, которых уже нет в коде.</p>
          <ul className="space-y-2">
            {stale.map((key) => (
              <StaleFlag key={key} flagKey={key} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
