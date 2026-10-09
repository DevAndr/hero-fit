"use client";

import { Swords, Trophy } from "lucide-react";
import { BossViewer } from "@/components/boss/boss-viewer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { BestiaryEntry } from "@/lib/boss/bestiary";
import { bossLore } from "@/lib/boss/bosses";
import { plural } from "@/lib/format";
import { weekRangeLabel } from "@/lib/recap/view";
import { bossTitles } from "@/lib/titles/catalog";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const number = new Intl.NumberFormat("ru-RU");

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Карточка побеждённого босса открывает диалог: картинка крупно, описание, цифры, титулы, история боёв. */
export function BossDetails({ entry }: { entry: BestiaryEntry }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`${entry.name}: подробнее`}
            className="absolute inset-0 z-10 cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" data-testid="boss-details">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{entry.name}</DialogTitle>
          <DialogDescription>{bossLore(entry.code)}</DialogDescription>
        </DialogHeader>

        <BossViewer code={entry.code} />

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Побед" value={number.format(entry.wins)} />
          <Stat label="Лучший урон за неделю" value={number.format(entry.bestDamage)} />
          <Stat label="Первая победа" value={entry.firstWin ? dateFormat.format(new Date(entry.firstWin)) : "—"} />
          <Stat
            label="На арене"
            value={entry.weeksUntil === 0 ? "сейчас" : `через ${entry.weeksUntil} ${plural(entry.weeksUntil, "неделю", "недели", "недель")}`}
          />
        </dl>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Титулы</h3>
          <ul className="space-y-1 text-sm">
            {bossTitles(entry.code).map((t) => {
              const earned = entry.wins >= t.wins;
              return (
                <li key={t.code} className={cn("flex items-center justify-between gap-2", !earned && "text-muted-foreground")}>
                  <span className={cn(earned && "font-medium")}>{t.label}</span>
                  <span className="text-xs">
                    {earned ? "получен" : `${Math.min(entry.wins, t.wins)} / ${t.wins} ${plural(t.wins, "победа", "победы", "побед")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {entry.history.length ? (
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">История боёв</h3>
            <ul className="divide-y text-sm" aria-label="История боёв">
              {entry.history.map((h) => (
                <li key={h.week} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="flex items-center gap-2">
                    {h.won ? <Trophy className="size-4 text-xp" /> : <Swords className="size-4 text-muted-foreground" />}
                    <span className="sr-only">{h.won ? "Победа:" : h.current ? "Бой идёт:" : "Ушёл:"}</span>
                    {weekRangeLabel(h.week)}
                    {h.current ? <span className="text-xs text-muted-foreground">· эта неделя</span> : null}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{number.format(h.damage)} урона</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
