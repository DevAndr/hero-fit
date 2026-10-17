import Link from "next/link";
import { SignalBadge } from "@/components/coach/signal-badge";
import { plural } from "@/lib/format";
import { planPct, type CoachRecapRow, type CoachRecapTotals, type RecapProgression } from "@/lib/coach/recap";
import type { CoachRecapView } from "@/lib/coach/recap-queries";
import { cn } from "@/lib/utils";

function Tile({ id, label, value, hint, accent }: { id: string; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div
      data-testid={id}
      data-accent={accent ? "" : undefined}
      className={cn("min-w-0 rounded-xl border bg-card p-3", accent && "border-streak/40 bg-streak/10 text-streak")}
    >
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function planHint(totals: CoachRecapTotals): string | undefined {
  if (!totals.plan || totals.prevPlanPct === null) return undefined;
  const d = planPct(totals.plan) - totals.prevPlanPct;
  if (d === 0) return "как неделей раньше";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} п.п. к прошлой`;
}

function Tiles({ totals }: { totals: CoachRecapTotals }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile id="coach-recap-trained" label="Тренировались" value={`${totals.trained} из ${totals.clients}`} />
      <Tile id="coach-recap-plan" label="План" value={totals.plan ? `${planPct(totals.plan)}%` : "—"} hint={planHint(totals)} />
      <Tile id="coach-recap-workouts" label="Тренировок" value={String(totals.workouts)} />
      <Tile id="coach-recap-records" label="Рекордов" value={String(totals.records)} />
      <Tile id="coach-recap-ups" label="Повышений веса" value={String(totals.ups)} />
      <Tile id="coach-recap-attention" label="Требуют внимания" value={String(totals.attention)} accent={totals.attention > 0} />
      <Tile id="coach-recap-unanswered" label="Без ответа" value={String(totals.unanswered)} accent={totals.unanswered > 0} />
    </div>
  );
}

const kg = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function progressionLine(p: RecapProgression): string {
  if (p.kind === "deload") return `↓ ${p.exercise} — разгрузка`;
  return `↑ ${p.exercise} +${kg(p.to - p.from)}${p.bodyweight ? " доп. кг" : " кг"}`;
}

function planLine(row: CoachRecapRow): string {
  const parts: string[] = [];
  if (row.plan) parts.push(`План ${row.plan.done}/${row.plan.total}`);
  const diff = row.workouts - row.prevWorkouts;
  const delta = diff === 0 ? "" : ` (${diff > 0 ? "+" : "−"}${Math.abs(diff)})`;
  parts.push(`${row.workouts} ${plural(row.workouts, "тренировка", "тренировки", "тренировок")}${delta}`);
  if (row.program) parts.push(`Нед. ${row.program.week}/${row.program.weeks}`);
  return parts.join(" · ");
}

function ClientCard({ clientId, name, row }: { clientId: string; name: string; row: CoachRecapRow }) {
  const base = `/coach/clients/${clientId}`;
  const prog = row.program;
  return (
    <li aria-label={name} className="min-w-0 space-y-1.5 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={base} className="min-w-0 truncate font-semibold hover:underline">
          {name}
        </Link>
        {row.isNew ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">новый</span> : null}
        {row.signals.map((kind) => (
          <Link key={kind} href={`${base}?tab=overview`} className="text-xs">
            <SignalBadge kind={kind} />
          </Link>
        ))}
      </div>
      <p className="text-muted-foreground">{planLine(row)}</p>
      {prog && (prog.nextDeload || prog.ending) ? (
        <p className="text-muted-foreground">{prog.ending ? "заканчивается" : "следующая — разгрузка"}</p>
      ) : null}
      {row.records.count > 0 ? (
        <p className="break-words">
          🏆 Рекорды: {row.records.names.join(", ")}
          {row.records.count > row.records.names.length ? ` и ещё ${row.records.count - row.records.names.length}` : ""}
        </p>
      ) : null}
      {row.progression.items.length > 0 ? (
        <p className="break-words">
          {row.progression.items.map(progressionLine).join(", ")}
          {row.progression.more > 0 ? ` и ещё ${row.progression.more}` : ""}
        </p>
      ) : null}
      {row.unanswered > 0 ? (
        <p>
          <Link href={`${base}?tab=workouts`} className="text-primary hover:underline">
            💬 {row.unanswered} без ответа
          </Link>
        </p>
      ) : null}
    </li>
  );
}

/** Итоги недели клиентов: плитки сверху, под ними карточки клиентов. */
export function CoachRecapViewBlock({ recap }: { recap: CoachRecapView }) {
  return (
    <section aria-label="Итоги недели клиентов" className="space-y-4">
      <Tiles totals={recap.totals} />
      <ul className="grid gap-2">
        {recap.rows.map((r) => (
          <ClientCard key={r.clientId} clientId={r.clientId} name={r.name} row={r.row} />
        ))}
      </ul>
    </section>
  );
}
