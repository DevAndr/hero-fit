import Image from "next/image";
import goblinSprite from "@/assets/icons/game/bosses/gold_goblin.png";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** Бестиарий «Редкие»: Золотой гоблин — сколько раз встречен и пойман; не встречен — «???». */
export function GoblinCard({ stats }: { stats: { seen: number; caught: number; firstCaughtAt: Date | null } }) {
  const known = stats.seen > 0;
  return (
    <article aria-label="Золотой гоблин" className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <Image
        src={goblinSprite}
        alt=""
        className={cn("h-24 w-auto shrink-0", !known && "opacity-30 brightness-0")}
        sizes="80px"
      />
      <div className="min-w-0">
        <h3 className="font-bold">{known ? "Золотой гоблин" : "???"}</h3>
        {known ? (
          <>
            <p className="text-sm tabular-nums">
              Встречен: {stats.seen} · Пойман: {stats.caught}
            </p>
            {stats.firstCaughtAt ? (
              <p className="text-xs text-muted-foreground">Первая поимка — {dateFormat.format(stats.firstCaughtAt)}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Иногда выскакивает посреди тренировки</p>
        )}
      </div>
    </article>
  );
}
