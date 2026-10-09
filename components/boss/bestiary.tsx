import { Star } from "lucide-react";
import { BossDetails } from "@/components/boss/boss-details";
import { BossSprite } from "@/components/boss/boss-sprite";
import type { BestiaryEntry } from "@/lib/boss/bestiary";
import { BOSSES } from "@/lib/boss/bosses";
import { plural } from "@/lib/format";
import { bossTitles } from "@/lib/titles/catalog";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const number = new Intl.NumberFormat("ru-RU");

function Stars({ stars }: { stars: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${stars} ${plural(stars, "звезда", "звезды", "звёзд")} из 3`}>
      {[1, 2, 3].map((i) => (
        <Star key={i} className={cn("size-4", i <= stars ? "fill-xp text-xp" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

function BossEntry({ entry }: { entry: BestiaryEntry }) {
  const open = entry.wins > 0;
  return (
    <article
      className={cn(
        "relative flex gap-4 rounded-xl border bg-card p-4",
        open && "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
      data-testid={`bestiary-${entry.code}`} aria-label={open ? entry.name : "Неизвестный босс"}>
      <BossSprite code={entry.code} size={72} className={cn(!open && "brightness-0 opacity-40")} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{open ? entry.name : "???"}</p>
          <Stars stars={entry.stars} />
        </div>
        <p className="text-xs text-muted-foreground">
          {entry.weeksUntil === 0
            ? "На арене сейчас"
            : `Придёт через ${entry.weeksUntil} ${plural(entry.weeksUntil, "неделю", "недели", "недель")}`}
        </p>
        {open ? (
          <p className="text-sm">
            Побед: {entry.wins}
            {entry.firstWin ? <span className="text-muted-foreground"> · первая победа: {dateFormat.format(new Date(entry.firstWin))}</span> : null}
          </p>
        ) : null}
        {entry.bestDamage > 0 ? (
          <p className="text-sm text-muted-foreground">Лучший урон за неделю: {number.format(entry.bestDamage)}</p>
        ) : null}
        <ul className="mt-2 space-y-0.5 text-sm" aria-label="Титулы">
          {bossTitles(entry.code).map((t) =>
            entry.wins >= t.wins ? (
              <li key={t.code} className="font-medium" data-testid="title-earned">
                {t.label}
              </li>
            ) : (
              <li key={t.code} className="text-muted-foreground">
                {open ? t.label : "???"} · {t.wins} {plural(t.wins, "победа", "победы", "побед")}
              </li>
            ),
          )}
        </ul>
      </div>
      {open ? <BossDetails entry={entry} /> : null}
    </article>
  );
}

/** Бестиарий: коллекция боссов недели — победы, звёзды и титулы. */
export function Bestiary({ entries }: { entries: BestiaryEntry[] }) {
  const starred = entries.filter((e) => e.stars > 0).length;
  return (
    <section className="space-y-3">
      <p className="text-sm" data-testid="bestiary-legend">
        <span className="font-semibold">Легенда бестиария</span>
        <span className="text-muted-foreground">
          {" "}
          · {starred === BOSSES.length ? "получена" : `звёзды у ${starred} из ${BOSSES.length} боссов`}
        </span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.map((e) => (
          <BossEntry key={e.code} entry={e} />
        ))}
      </div>
    </section>
  );
}
