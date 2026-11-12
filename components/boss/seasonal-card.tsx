import Image from "next/image";
import { bossImage } from "@/components/boss/boss-sprite";
import type { SeasonalEntry } from "@/lib/boss/bestiary";
import { SEASONAL_BOSSES } from "@/lib/boss/bosses";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const number = new Intl.NumberFormat("ru-RU");

/** Бестиарий «Редкие»: сезонный босс (Гринч) — победы, первая победа, лучший урон; до победы — «???». Без звёзд. */
export function SeasonalCard({ entry }: { entry: SeasonalEntry }) {
  const open = entry.wins > 0;
  const image = bossImage(entry.code);
  const hint = SEASONAL_BOSSES.find((b) => b.code === entry.code)?.hint;
  return (
    <article
      aria-label={open ? entry.name : "Неизвестный босс"}
      data-testid={`bestiary-${entry.code}`}
      className="flex items-center gap-4 rounded-xl border bg-card p-4"
    >
      {image ? (
        <Image
          src={image}
          alt=""
          sizes="96px"
          className={cn("h-auto w-24 shrink-0 rounded-lg", !open && "opacity-30 brightness-0")}
        />
      ) : null}
      <div className="min-w-0 space-y-1">
        <h3 className="font-bold">{open ? entry.name : "???"}</h3>
        {entry.current ? <p className="text-xs text-muted-foreground">На арене сейчас</p> : null}
        {open ? (
          <p className="text-sm">
            Побед: {entry.wins}
            {entry.firstWin ? <span className="text-muted-foreground"> · первая победа: {dateFormat.format(new Date(entry.firstWin))}</span> : null}
          </p>
        ) : null}
        {entry.bestDamage > 0 ? (
          <p className="text-sm text-muted-foreground">Лучший урон за неделю: {number.format(entry.bestDamage)}</p>
        ) : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </article>
  );
}
