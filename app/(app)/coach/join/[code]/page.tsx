import type { Metadata } from "next";
import Link from "next/link";
import { Check, ClipboardList } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { activeCoachOf } from "@/lib/coach/access";
import { acceptCoachAction } from "@/lib/coach/actions";
import { clientDisplayName } from "@/lib/coach/clients";
import { getCoachByCode } from "@/lib/coach/queries";

export const metadata: Metadata = { title: "Приглашение тренера" };

const SHARED = ["Тренировки с подходами и весами", "Статистика и личные рекорды", "Карта мышц: восстановление и баланс"];

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md space-y-5 rounded-2xl border bg-card p-6">{children}</div>;
}

/** Согласие клиента на доступ тренера (ссылка из раздела «Клиенты» тренера). */
export default async function CoachJoinPage({ params }: PageProps<"/coach/join/[code]">) {
  const user = await requireUser();
  const { code } = await params;
  const coach = await getCoachByCode(code);

  if (!coach) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Ссылка недействительна</h1>
        <p className="text-sm text-muted-foreground">Попросите тренера прислать актуальную ссылку из раздела «Клиенты».</p>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          На главную
        </Link>
      </Card>
    );
  }

  const coachName = clientDisplayName(coach);
  if (coach.id === user.id) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Это ваша ссылка</h1>
        <p className="text-sm text-muted-foreground">Отправьте её клиенту — после его согласия он появится в разделе «Клиенты».</p>
        <Link href="/coach" className={buttonVariants()}>
          К клиентам
        </Link>
      </Card>
    );
  }

  const current = await activeCoachOf(user.id);
  if (current?.id === coach.id) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Вы уже занимаетесь с {coachName}</h1>
        <p className="text-sm text-muted-foreground">Тренер видит ваши тренировки. Отключить доступ можно в настройках.</p>
        <Link href="/dashboard" className={buttonVariants()}>
          На главную
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <ClipboardList className="size-6" aria-hidden />
      </div>
      <h1 className="text-xl font-bold">Тренер {coachName} просит доступ к вашим тренировкам</h1>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Тренер увидит:</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {SHARED.map((t) => (
            <li key={t} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Логин и почта остаются скрытыми. Доступ можно отозвать в любой момент в настройках.</p>
      </div>
      {current ? (
        <p className="rounded-lg border border-streak/40 bg-streak/10 p-3 text-sm">
          Сейчас ваш тренер — {clientDisplayName(current)}. Перейти к {coachName}? Прежний тренер потеряет доступ.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={acceptCoachAction.bind(null, code)}>
          <Button type="submit">Разрешить</Button>
        </form>
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost" })}>
          Отказаться
        </Link>
      </div>
    </Card>
  );
}
