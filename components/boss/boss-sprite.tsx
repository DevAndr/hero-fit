import Image, { type StaticImageData } from "next/image";
import { Skull } from "lucide-react";
import type { BossCode } from "@/lib/boss/bosses";
import { cn } from "@/lib/utils";
import boneLich from "@/assets/icons/game/bosses/bone_lich.png";
import crystalGuardian from "@/assets/icons/game/bosses/crystal_guardian.png";
import fireDragon from "@/assets/icons/game/bosses/fire_dragon.png";
import forestTree from "@/assets/icons/game/bosses/forest_tree.png";
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
 */
const SPRITES: Record<BossCode, StaticImageData> = {
  golem: ironGolem,
  troll: iceTroll,
  dragon: fireDragon,
  knight: shadowKnight,
  lich: boneLich,
  treant: forestTree,
  colossus: sandSpike,
  crystal: crystalGuardian,
  storm: thunderstormTitan,
  queen: poisonousQueen,
  runes: guardianRunes,
  void: voidTitan,
};

/** Картинка босса целиком (бестиарий); неизвестный код — null. */
export function bossImage(code: string): StaticImageData | null {
  return SPRITES[code as BossCode] ?? null;
}

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
  const sprite = bossImage(code);
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
