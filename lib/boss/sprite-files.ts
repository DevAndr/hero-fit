import type { BossCode } from "@/lib/boss/bosses";

/**
 * Спрайты боссов для картинки — файлы в `assets/icons/game/bosses` (в standalone их кладёт
 * outputFileTracingIncludes в next.config.ts). Тот же набор, что SPRITES в components/boss/boss-sprite.tsx.
 */
export const BOSS_SPRITE_FILES: Record<BossCode, string> = {
  golem: "iron_golem.png",
  troll: "ice_troll.png",
  dragon: "fire_dragon.png",
  knight: "shadow_knight.png",
  lich: "bone_lich.png",
  treant: "forest_tree.png",
  colossus: "sand_spike.png",
  crystal: "crystal_guardian.png",
  storm: "thunderstorm_titan.png",
  queen: "poisonous_queen.png",
  runes: "guardian_runes.png",
  void: "void_titan.png",
};
