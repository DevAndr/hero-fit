import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { AssignManyButton } from "@/components/coach/assign-many";
import { ClientList } from "@/components/coach/client-list";
import { InviteCard } from "@/components/coach/invite-card";
import { buttonVariants } from "@/components/ui/button";
import { requireCoach } from "@/lib/coach/access";
import { sortClients } from "@/lib/coach/clients";
import { ensureCoachCode, getCoachClients } from "@/lib/coach/queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { telegramEnabled } from "@/lib/telegram/format";
import { telegramJoinUrl } from "@/lib/telegram/links";

export const metadata: Metadata = { title: "Клиенты" };

const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export default async function CoachPage() {
  const coach = await requireCoach();
  const now = new Date();
  const [code, clients, templates] = await Promise.all([
    ensureCoachCode(coach.id),
    getCoachClients(coach.id, now),
    db.workoutTemplate.findMany({ where: { userId: coach.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const sorted = sortClients(clients);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Клиенты"
        description="Тренировки и прогресс ваших клиентов"
        actions={
          <Link href="/coach/page" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Globe />
            Публичная страница
          </Link>
        }
      />
      {clients.length > 1 ? (
        <AssignManyButton
          clients={sorted.map((c) => ({ id: c.id, name: c.name }))}
          templates={templates}
          today={dayKey(now, safeTimeZone(coach.timeZone))}
        />
      ) : null}
      {clients.length ? (
        <ClientList rows={sorted} now={now} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">Пока нет клиентов</p>
          <p className="max-w-sm text-sm text-muted-foreground">Отправьте ссылку клиенту — после его согласия он появится здесь.</p>
        </div>
      )}
      <InviteCard
        url={new URL(`/coach/join/${code}`, env.APP_URL).toString()}
        code={pretty(code)}
        telegramUrl={telegramEnabled(env) ? telegramJoinUrl(code, env.TELEGRAM_BOT_USERNAME) : null}
      />
    </div>
  );
}
