"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import { markAchievementsSeenAction } from "@/lib/achievements/actions";
import { useFlag } from "@/components/flags/flags-provider";
import { achievementCoins } from "@/lib/shop/coins";
import { coinWord } from "@/lib/shop/labels";
import { haptic } from "@/lib/telegram/webapp";
import { titleForAchievement } from "@/lib/titles/catalog";

type Unseen = { id: string; code: string; title: string; description: string; xpReward: number };

/** Показывает тосты о новых ачивках один раз и помечает их просмотренными. */
export function AchievementToaster({ achievements }: { achievements: Unseen[] }) {
  const shop = useFlag("shop");
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const fresh = achievements.filter((a) => !shown.current.has(a.id));
    if (fresh.length === 0) return;
    haptic("success");
    for (const a of fresh) {
      shown.current.add(a.id);
      const title = titleForAchievement(a.code);
      toast.success(`🏆 ${a.title}`, {
        id: a.id, // тостеры layout и страницы (/coach) не задваивают одну ачивку
        description: `${a.description} · +${a.xpReward} XP${shop ? ` · +${achievementCoins(a.xpReward)} ${coinWord(achievementCoins(a.xpReward))}` : ""}${title ? ` · + титул «${title.label}»` : ""}`,
        icon: <AchievementIcon code={a.code} size={40} />,
        duration: 6000,
      });
    }
    void markAchievementsSeenAction(fresh.map((a) => a.id));
  }, [achievements, shop]);

  return null;
}
