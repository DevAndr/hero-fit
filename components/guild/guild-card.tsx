import Link from "next/link";
import { Shield } from "lucide-react";
import { GuildEmblem } from "@/lib/guild/emblem";
import type { MyGuild } from "@/lib/guild/queries";

/** Карточка «Гильдия» на дашборде: без гильдии — призыв, с гильдией — кто потренировался на этой неделе. */
export function GuildCard({ guild }: { guild: MyGuild | null }) {
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
      <span className="min-w-0">
        <span className="block truncate font-semibold">{guild.name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          На этой неделе потренировались {active} из {total}
        </span>
      </span>
    </Link>
    </section>
  );
}
