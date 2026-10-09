import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { InviteCard } from "@/components/coach/invite-card";
import { requireCoach } from "@/lib/coach/access";
import { ensureCoachCode } from "@/lib/coach/queries";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Клиенты" };

const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export default async function CoachPage() {
  const coach = await requireCoach();
  const code = await ensureCoachCode(coach.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Клиенты" description="Тренировки и прогресс ваших клиентов" />
      <InviteCard url={new URL(`/coach/join/${code}`, env.APP_URL).toString()} code={pretty(code)} />
    </div>
  );
}
