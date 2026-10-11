"use client";

/**
 * Рейд гильдии для лендинга: рейд-босс, общая полоса HP и вклад участников. Декоративно (aria-hidden, смысл — в тексте
 * раздела и sr-only), анимации конечные и стартуют при попадании в экран, как в game-infographics.tsx.
 */
import Image from "next/image";
import { m } from "motion/react";
import { Crown, Shield } from "lucide-react";
import { bossImage } from "@/components/boss/boss-sprite";
import { CountUp, useSeen } from "@/components/marketing/motion";
import { raidBossName } from "@/lib/raid/rules";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const HP = 4200;
const MEMBERS = [
  { nick: "Тора", damage: 1450 },
  { nick: "Влад", damage: 1100 },
  { nick: "Мира", damage: 850 },
  { nick: "Сёма", damage: 600 },
];
const DAMAGE = MEMBERS.reduce((s, x) => s + x.damage, 0);
const BOSS = "colossus";

export function RaidInfographic() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const image = bossImage(BOSS);
  const left = HP - DAMAGE;
  return (
    <div className="rounded-2xl border bg-card/90 p-5 backdrop-blur">
      <p className="sr-only">
        Пример: {raidBossName(BOSS)}, {HP} HP. Четверо участников нанесли {DAMAGE} урона, до победы {left}. MVP — {MEMBERS[0].nick}.
      </p>
      <div ref={ref} aria-hidden>
        <div className="flex items-center gap-4">
          {image ? (
            <Image src={image} alt="" sizes="112px" className="h-auto w-28 shrink-0 saturate-150 drop-shadow-[0_0_14px_var(--destructive)]" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="size-4 text-destructive" /> Рейд недели
            </p>
            <p className="font-bold">{raidBossName(BOSS)}</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <m.div
                className="h-full rounded-full bg-destructive"
                initial={{ width: "100%" }}
                animate={seen ? { width: `${(left / HP) * 100}%` } : undefined}
                transition={{ duration: 1.4, delay: 0.3, ease: EASE }}
              />
            </div>
            <p className="mt-1 text-sm tabular-nums">
              <CountUp value={left} from={HP} delay={0.3} className="font-semibold" /> / {HP} HP · до победы чуть-чуть
            </p>
          </div>
        </div>
        <ul className="mt-5 space-y-2.5">
          {MEMBERS.map((x, i) => (
            <li key={x.nick} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium">
                  {i === 0 ? <Crown className="size-4 text-xp" /> : null}
                  {x.nick}
                  {i === 0 ? <span className="text-xs font-semibold text-xp">MVP</span> : null}
                </span>
                <span className="tabular-nums text-muted-foreground">{x.damage}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <m.div
                  className="h-full rounded-full bg-destructive/70"
                  initial={{ width: 0 }}
                  animate={seen ? { width: `${(x.damage / MEMBERS[0].damage) * 100}%` } : undefined}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.12, ease: EASE }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
