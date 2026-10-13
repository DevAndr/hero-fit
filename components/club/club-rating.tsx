import { PlayerAvatar } from "@/components/shop/player-avatar";
import { PlayerName } from "@/components/shop/player-name";
import { PlaceBadge } from "@/components/social/place-badge";
import type { ClubRating } from "@/lib/club/queries";
import { cn } from "@/lib/utils";

/** Рейтинг клуба: место, ник, уровень, XP (число тренировок не показывается — согласие обещает «Тренировки — нет»). Участники без опыта за период — одной строкой ниже. */
export function ClubRatingTable({ rating, periodLabel }: { rating: ClubRating; periodLabel: string }) {
  if (!rating.members.length) {
    return <p className="text-sm text-muted-foreground">За {periodLabel} ещё никто не тренировался — будь первым.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table aria-label="Рейтинг клуба" className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="w-12 px-3 py-2 text-left font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Участник
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Ур.
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                XP
              </th>
            </tr>
          </thead>
          <tbody>
            {rating.members.map((m) => (
              <tr key={m.id} className={cn("border-b last:border-0", m.me && "bg-primary/5")}>
                <td className="px-3 py-2">
                  <PlaceBadge place={m.place} xp={m.xp} />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <PlayerAvatar nickname={m.nickname} cosmetics={m.cosmetics} size="sm" />
                    <span className="font-medium break-words">
                      <PlayerName nickname={m.nickname} color={m.cosmetics?.nickColor} />
                    </span>
                  </span>
                  {m.me ? <span className="text-muted-foreground"> (ты)</span> : null}
                  {m.title ? <span className="block text-xs text-muted-foreground">{m.title}</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.level}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-xp">{m.xp.toLocaleString("ru-RU")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rating.idle > 0 ? <p className="text-sm text-muted-foreground">Ещё {rating.idle} без тренировок</p> : null}
    </div>
  );
}
