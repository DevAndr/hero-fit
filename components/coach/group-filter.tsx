import Link from "next/link";
import type { CoachGroupView } from "@/lib/coach/groups";
import { cn } from "@/lib/utils";

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-sm transition-colors",
    active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
  );

/** «Все · Утро (5) · Онлайн (3)» над списком /coach; выбор — `?group=<id>`. */
export function GroupFilter({ groups, active }: { groups: CoachGroupView[]; active: string | null }) {
  if (!groups.length) return null;
  return (
    <nav aria-label="Фильтр по группе" className="flex flex-wrap gap-2">
      <Link href="/coach" className={chip(active === null)} aria-current={active === null ? "page" : undefined}>
        Все
      </Link>
      {groups.map((g) => (
        <Link
          key={g.id}
          href={`/coach?group=${g.id}`}
          className={chip(active === g.id)}
          aria-current={active === g.id ? "page" : undefined}
        >
          {g.name} <span className="tabular-nums">({g.clientIds.length})</span>
        </Link>
      ))}
    </nav>
  );
}

/** Значки групп клиента. */
export function GroupBadges({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((n) => (
        <span key={n} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {n}
        </span>
      ))}
    </span>
  );
}
