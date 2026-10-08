import Image, { type StaticImageData } from "next/image";
import { Skull } from "lucide-react";
import type { BossCode } from "@/lib/boss/bosses";
import { cn } from "@/lib/utils";

/**
 * Спрайты боссов: `assets/icons/game/boss_<code>.png`, статический импорт (next/image ужимает в WebP).
 * Добавить: `import golem from "@/assets/icons/game/boss_golem.png"` и `golem` в SPRITES. Без спрайта — заглушка.
 */
const SPRITES: Partial<Record<BossCode, StaticImageData>> = {};

/** Декоративно: имя босса всегда рядом текстом. */
export function BossSprite({
  code,
  defeated = false,
  size,
  className,
}: {
  code: string;
  defeated?: boolean;
  size: number;
  className?: string;
}) {
  const sprite = SPRITES[code as BossCode];
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center transition-[filter,transform] duration-500 motion-reduce:transition-none",
        defeated && "translate-y-1 rotate-12 grayscale",
        className,
      )}
      style={{ width: size, height: size }}
      data-boss={code}
    >
      {sprite ? (
        <Image src={sprite} alt="" sizes={`${size}px`} className="size-full object-contain" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-streak/15 text-streak">
          <Skull className="size-1/2" />
        </span>
      )}
    </span>
  );
}
