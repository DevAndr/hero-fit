import Image, { type StaticImageData } from "next/image";
import { Skull } from "lucide-react";
import type { AnyBossCode } from "@/lib/boss/bosses";
import { cn } from "@/lib/utils";
import boneLich from "@/assets/icons/game/bosses/bone_lich.png";
import crystalGuardian from "@/assets/icons/game/bosses/crystal_guardian.png";
import fireDragon from "@/assets/icons/game/bosses/fire_dragon.png";
import forestTree from "@/assets/icons/game/bosses/forest_tree.png";
import grinch from "@/assets/icons/game/bosses/grinch.png";
import guardianRunes from "@/assets/icons/game/bosses/guardian_runes.png";
import iceTroll from "@/assets/icons/game/bosses/ice_troll.png";
import ironGolem from "@/assets/icons/game/bosses/iron_golem.png";
import poisonousQueen from "@/assets/icons/game/bosses/poisonous_queen.png";
import sandSpike from "@/assets/icons/game/bosses/sand_spike.png";
import shadowKnight from "@/assets/icons/game/bosses/shadow_knight.png";
import thunderstormTitan from "@/assets/icons/game/bosses/thunderstorm_titan.png";
import voidTitan from "@/assets/icons/game/bosses/void_titan.png";

/**
 * Спрайты боссов: `assets/icons/game/bosses/*.png`, статический импорт (next/image ужимает в WebP).
 * Новый босс — импорт и строка в SPRITES. Без спрайта (неизвестный код) — заглушка.
 * `opaque` — картинка с непрозрачным фоном: в маленьком размере скругляем углы, чтобы не было плашки.
 */
const SPRITES: Record<AnyBossCode, { image: StaticImageData; opaque?: true }> = {
  golem: { image: ironGolem },
  troll: { image: iceTroll },
  dragon: { image: fireDragon },
  knight: { image: shadowKnight },
  lich: { image: boneLich },
  treant: { image: forestTree },
  colossus: { image: sandSpike },
  crystal: { image: crystalGuardian },
  storm: { image: thunderstormTitan },
  queen: { image: poisonousQueen },
  runes: { image: guardianRunes },
  void: { image: voidTitan },
  grinch: { image: grinch, opaque: true },
};

/** До какого размера спрайт считается маленьким (скругление непрозрачных). */
const SMALL_SPRITE = 64;

/** Картинка босса целиком (бестиарий); неизвестный код — null. */
export function bossImage(code: string): StaticImageData | null {
  return SPRITES[code as AnyBossCode]?.image ?? null;
}

/** Декоративно: имя босса всегда рядом текстом. */
export function BossSprite({
  code,
  defeated = false,
  raid = false,
  size,
  className,
}: {
  code: string;
  defeated?: boolean;
  /** Рейд-босс гильдии: тот же спрайт с красной аурой. */
  raid?: boolean;
  size: number;
  className?: string;
}) {
  const entry = SPRITES[code as AnyBossCode];
  const sprite = entry?.image ?? null;
  const rounded = !!entry?.opaque && size <= SMALL_SPRITE;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center transition-[filter,transform] duration-500 motion-reduce:transition-none",
        raid && !defeated && "drop-shadow-[0_0_10px_var(--destructive)] saturate-150",
        defeated && "translate-y-1 rotate-12 grayscale",
        className,
      )}
      style={{ width: size, height: size }}
      data-boss={code}
    >
      {sprite ? (
        <Image src={sprite} alt="" sizes={`${size}px`} className={rounded ? "h-auto max-h-full w-full rounded-lg object-contain" : "size-full object-contain"} />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-streak/15 text-streak">
          <Skull className="size-1/2" />
        </span>
      )}
    </span>
  );
}
