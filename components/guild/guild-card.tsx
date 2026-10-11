import Link from "next/link";
import { Shield } from "lucide-react";
import { GuildEmblem } from "@/lib/guild/emblem";
import type { MyGuild } from "@/lib/guild/queries";
import type { RaidView } from "@/lib/raid/queries";

/** Карточка «Гильдия» на дашборде: без гильдии — призыв, с гильдией — кто потренировался на этой неделе и рейд. */
export function GuildCard({ guild, raid }: { guild: MyGuild | null; raid: RaidView | null }) {
  if (!guild) {
    return (
      <section aria-label="Гильдия">
      <Link
        href="/guild"
        className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50"
      >
        <Shield className="size-5 shrink-0 text-primary" />
        <span>
          <span className="block font-semibold text-foreground">Гильдия</span>
          Создайте гильдию или вступите по ссылке — тренируйтесь командой.
        </span>
      </Link>
      </section>
    );
  }
  const active = guild.members.filter((m) => m.workouts > 0).length;
  const total = guild.members.length;
  return (
    <section aria-label="Гильдия">
    <Link href="/guild" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <GuildEmblem code={guild.emblem} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{guild.name}</span>
        <span className="block text-sm text-muted-foreground tabular-nums">
          На этой неделе потренировались {active} из {total}
        </span>
        {raid ? <RaidLine raid={raid} /> : null}
      </span>
    </Link>
    </section>
  );
}

/** Рейд в карточке: полоса HP гильдии и что осталось. */
function RaidLine({ raid }: { raid: RaidView }) {
  const left = Math.max(0, raid.hp - raid.damage);
  return (
    <span className="mt-2 block space-y-1">
      <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-streak" style={{ width: `${raid.hp ? (left / raid.hp) * 100 : 0}%` }} />
      </span>
      <span className="block text-xs tabular-nums">
        {raid.defeatedAt ? (
          <span className="font-semibold text-primary">Рейд-босс повержен</span>
        ) : (
          <span className="text-muted-foreground">
            {raid.name}: до победы {left} урона
          </span>
        )}
        {raid.myReward ? <span className="ml-1 font-semibold text-xp">· Сундук ждёт</span> : null}
      </span>
    </span>
  );
}
