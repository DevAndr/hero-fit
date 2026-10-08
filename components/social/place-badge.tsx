import Image, { type StaticImageData } from "next/image";
import first from "@/assets/icons/league/number_one_in_league.png";
import third from "@/assets/icons/league/number_three_in_league.png";
import second from "@/assets/icons/league/number_two_in_league.png";
import unknown from "@/assets/icons/achievements/unknow_position_in_league.png";
import { cn } from "@/lib/utils";

const PODIUM: Record<number, StaticImageData> = { 1: first, 2: second, 3: third };

/**
 * Место в лиге: 1–3 — кубок, 4+ — значок «неопределённое место». Без XP кубка нет: в пустой неделе все делят
 * «1-е место» — там номер.
 * Подпись для скринридеров — `${place} место`.
 */
export function PlaceBadge({ place, xp, size = 32, className }: { place: number; xp: number; size?: number; className?: string }) {
  const cup = place > 3 ? unknown : xp > 0 ? PODIUM[place] : undefined;
  return (
    <span
      role="img"
      aria-label={`${place} место`}
      className={cn("flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {cup ? (
        <Image src={cup} alt="" width={size} height={size} className="size-full object-contain" />
      ) : (
        <span aria-hidden className="text-sm font-black text-muted-foreground tabular-nums">
          {place}
        </span>
      )}
    </span>
  );
}
