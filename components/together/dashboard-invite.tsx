import Link from "next/link";
import { Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Дашборд: друг зовёт тренироваться — пока приглашение живо (15 минут). */
export function DashboardInvite({ invite }: { invite: { id: string; hostName: string } }) {
  return (
    <section aria-label="Приглашение потренироваться" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Users className="size-4 text-primary" aria-hidden />
        {invite.hostName} зовёт тренироваться
      </p>
      <Link href={`/together/${invite.id}`} className={buttonVariants({ size: "sm" })}>
        Присоединиться
      </Link>
    </section>
  );
}
