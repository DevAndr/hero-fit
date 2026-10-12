import { Crown, Swords } from "lucide-react";
import { BossHpBar } from "@/components/boss/boss-card";
import { BossSprite } from "@/components/boss/boss-sprite";
import { RaidChestButton } from "@/components/raid/raid-chest-button";
import { plural } from "@/lib/format";
import type { RaidHistoryEntry, RaidView } from "@/lib/raid/queries";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/** «Рейд недели» на /guild: рейд-босс, HP гильдии, вклад участников, сундук. */
export function RaidPanel({ raid }: { raid: RaidView }) {
  const left = Math.max(0, raid.hp - raid.damage);
  const defeated = raid.defeatedAt !== null;
  const top = Math.max(1, ...raid.members.map((m) => m.damage));
  return (
    <section aria-label="Рейд недели" className="rounded-xl border bg-card p-4" data-testid="raid-panel">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <Swords className="size-4 text-destructive" />
          Рейд недели
        </p>
        <p className="text-xs">
          {defeated
            ? `Повержен · ${dateFmt.format(new Date(raid.defeatedAt!))}`
            : raid.daysLeft <= 1
              ? "последний день"
              : `осталось ${raid.daysLeft} ${plural(raid.daysLeft, "день", "дня", "дней")}`}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <BossSprite code={raid.code} raid defeated={defeated} size={96} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-bold">{raid.name}</p>
          <BossHpBar hp={raid.hp} left={left} name={raid.name} />
          <p className="text-sm tabular-nums">
            <span className="font-semibold">
              {left} / {raid.hp} HP
            </span>
            {defeated ? (
              <span className="ml-2 font-bold text-primary">Повержен!</span>
            ) : (
              <span className="text-muted-foreground"> · до победы {left} урона</span>
            )}
          </p>
          <RaidChestButton reward={raid.myReward} />
        </div>
      </div>
      <ul aria-label="Вклад в рейд" className="mt-4 space-y-2">
        {raid.members.map((m) => (
          <li key={m.userId} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {m.mvp ? <Crown aria-label="MVP" className="size-4 shrink-0 text-xp" /> : null}
                <span className="truncate font-medium">{m.nickname}</span>
                {m.former ? <span className="text-xs text-muted-foreground">бывший участник</span> : null}
              </span>
              <span className="tabular-nums text-muted-foreground">{m.damage}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-destructive/70" style={{ width: `${(m.damage / top) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Прошлые рейды»: до 8 недель — босс, победа, урон гильдии и мой вклад. */
export function RaidHistory({ history }: { history: RaidHistoryEntry[] }) {
  if (!history.length) return null;
  return (
    <section aria-label="Прошлые рейды" className="space-y-2">
      <h2 className="font-bold">Прошлые рейды</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {history.map((r) => (
          <li key={r.week} className="flex items-center gap-3 p-3 text-sm">
            <BossSprite code={r.code} raid defeated={r.defeated} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                неделя с {dateFmt.format(new Date(`${r.week}T12:00:00Z`))} · {r.defeated ? "повержен" : "устоял"}
              </span>
            </span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {r.damage} / {r.hp}
              <span className="block">мой вклад {r.mine}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
