import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { InviteActions } from "@/components/together/invite-card";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { partnerName, settle } from "@/lib/together/queries";

export const metadata: Metadata = { title: "Тренировка вместе" };

const STATUS_TEXT = {
  EXPIRED: "Приглашение истекло",
  DECLINED: "Приглашение отменено",
  ENDED: "Совместная тренировка закончилась",
  ACTIVE: "Вы уже тренируетесь вместе",
} as const;

/** Приглашение потренироваться вместе (ссылка из уведомления и с дашборда). */
export default async function TogetherInvitePage({ params }: PageProps<"/together/[id]">) {
  const user = await requireUser();
  if (!(await isEnabled("together", user.id))) notFound();
  const { id } = await params;
  const row = await db.trainingSession.findFirst({
    where: { id, OR: [{ hostId: user.id }, { guestId: user.id }] },
    include: { host: { select: { nickname: true } }, guest: { select: { nickname: true } }, hostWorkout: { select: { startedAt: true } } },
  });
  if (!row) notFound();
  const s = await settle(db, row, new Date());
  const isGuest = s.guestId === user.id;
  const other = partnerName(isGuest ? row.host.nickname : row.guest.nickname);
  const since = row.hostWorkout?.startedAt
    ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: safeTimeZone(user.timeZone) }).format(row.hostWorkout.startedAt)
    : null;

  return (
    <div className="mx-auto max-w-md py-6">
      <section aria-label="Приглашение" className="space-y-4 rounded-xl border bg-card p-5">
        <h1 className="flex items-center gap-2 text-xl font-black">
          <Users className="size-5 text-primary" aria-hidden />
          Тренировка вместе
        </h1>
        {s.status === "INVITED" && isGuest ? (
          <>
            <p>
              <b>{other}</b> {since ? `тренируется с ${since}` : "в зале"}. Тренируйтесь вместе — каждый свою тренировку: вы будете видеть подходы
              друг друга, а за совместную тренировку оба получите бонус XP.
            </p>
            <InviteActions sessionId={s.id} />
          </>
        ) : (
          <>
            <p className="text-muted-foreground">{s.status === "INVITED" ? `Ждём ${other}` : STATUS_TEXT[s.status]}</p>
            <Link href="/training" className={buttonVariants({ variant: "outline" })}>
              К тренировке
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
