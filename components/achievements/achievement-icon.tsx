import Image, { type StaticImageData } from "next/image";
import { achievementIconKey, type AchievementIconKey } from "@/lib/achievements/icons";
import { cn } from "@/lib/utils";
import badge100 from "@/assets/icons/achievements/100_weigth_push.png";
import add5 from "@/assets/icons/achievements/add_5_kg.png";
import threeWeek from "@/assets/icons/achievements/3x_training.png";
import fallback from "@/assets/icons/achievements/default.png";
import firstTemplate from "@/assets/icons/achievements/first_template.png";
import firstTraining from "@/assets/icons/achievements/first_training.png";
import inStreak from "@/assets/icons/achievements/in_streak.png";
import manySet from "@/assets/icons/achievements/many_set.png";
import league1 from "@/assets/icons/achievements/number_one_in_league.png";
import league3 from "@/assets/icons/achievements/number_three_in_league.png";
import league2 from "@/assets/icons/achievements/number_two_in_league.png";
import progress from "@/assets/icons/achievements/progress_in_training.png";
import push100 from "@/assets/icons/achievements/push_100_kg.png";
import stableStreak from "@/assets/icons/achievements/stable_in_streak.png";
import visit from "@/assets/icons/achievements/visit.png";

const ICONS: Record<AchievementIconKey, StaticImageData> = {
  default: fallback,
  first_training: firstTraining,
  "3x_training": threeWeek,
  number_one_in_league: league1,
  number_two_in_league: league2,
  number_three_in_league: league3,
  "100_weigth_push": badge100,
  push_100_kg: push100,
  visit,
  add_5_kg: add5,
  many_set: manySet,
  first_template: firstTemplate,
  in_streak: inStreak,
  stable_in_streak: stableStreak,
  progress_in_training: progress,
};

/** Значок ачивки. Декоративный: название ачивки всегда рядом текстом. */
export function AchievementIcon({
  code,
  size,
  locked,
  className,
}: {
  code: string;
  /** Сторона квадрата в px. */
  size: number;
  /** Ещё не получена — приглушённая и бесцветная. */
  locked?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={ICONS[achievementIconKey(code)]}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", locked && "opacity-60 grayscale", className)}
      style={{ width: size, height: size }}
    />
  );
}
