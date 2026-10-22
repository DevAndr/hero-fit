import Link from "next/link";
import { CalendarRange, MessageCircle } from "lucide-react";
import { PlayerAvatar } from "@/components/shop/player-avatar";
import type { MyCoachCard as Card } from "@/lib/coach/my-coach";
import { plural } from "@/lib/format";

/** «Мой тренер» на дашборде клиента: кто, сколько вместе, идущая программа и новые комментарии. */
export function MyCoachCard({ card }: { card: Card }) {
  return (
    <section aria-label="Мой тренер" className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <PlayerAvatar nickname={card.name} cosmetics={card.cosmetics} size="md" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">Мой тренер</p>
        {card.pageHref ? (
          <Link href={card.pageHref} className="block truncate font-semibold hover:text-primary hover:underline">
            {card.name}
          </Link>
        ) : (
          <p className="truncate font-semibold">{card.name}</p>
        )}
        <p className="text-sm text-muted-foreground">{card.together}</p>
        {card.program ? (
          <p className="flex items-center gap-1.5 text-sm">
            <CalendarRange aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              Программа «{card.program.name}» · неделя {card.program.week}/{card.program.weeks}
            </span>
          </p>
        ) : null}
        {card.unread ? (
          <Link href={card.unread.href} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <MessageCircle aria-hidden className="size-4 shrink-0" />
            {card.unread.count} {plural(card.unread.count, "новый комментарий", "новых комментария", "новых комментариев")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
