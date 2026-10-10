import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ClientList } from "@/components/coach/client-list";
import { InviteCard } from "@/components/coach/invite-card";
import { buttonVariants } from "@/components/ui/button";
import { requireCoach } from "@/lib/coach/access";
import { sortClients } from "@/lib/coach/clients";
import { ensureCoachCode, getCoachClients } from "@/lib/coach/queries";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Клиенты" };

const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export default async function CoachPage() {
  const coach = await requireCoach();
  const now = new Date();
  const [code, clients] = await Promise.all([ensureCoachCode(coach.id), getCoachClients(coach.id, now)]);

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
      {clients.length ? (
        <ClientList rows={sortClients(clients, now)} now={now} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">Пока нет клиентов</p>
          <p className="max-w-sm text-sm text-muted-foreground">Отправьте ссылку клиенту — после его согласия он появится здесь.</p>
        </div>
      )}
      <InviteCard url={new URL(`/coach/join/${code}`, env.APP_URL).toString()} code={pretty(code)} />
    </div>
  );
}
