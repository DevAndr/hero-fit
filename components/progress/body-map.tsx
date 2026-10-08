"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { BODY_BACK, BODY_FRONT, type BodyPart } from "@/lib/progress/body-map-data";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { RECOVERY_STATE_LABELS, recoveryHint, type GroupRecovery, type RecoveryState } from "@/lib/progress/recovery";
import { cn } from "@/lib/utils";

/** Цвет состояния — заливка мышцы на силуэте и точка в списке / фильтре. */
export const RECOVERY_FILL: Record<RecoveryState, string> = {
  fatigued: "fill-streak",
  recovering: "fill-xp",
  ready: "fill-primary",
  neglected: "fill-muted-foreground/30",
};
export const RECOVERY_DOT: Record<RecoveryState, string> = {
  fatigued: "bg-streak",
  recovering: "bg-xp",
  ready: "bg-primary",
  neglected: "bg-muted-foreground/40",
};
const ORDER: RecoveryState[] = ["fatigued", "recovering", "ready", "neglected"];

/** Короткий статус для списка: «60 %», «можно», «9 дн.». */
function shortStatus(r: GroupRecovery) {
  if (r.state === "neglected") return r.daysSince === null ? "не было" : `${r.daysSince} дн.`;
  if (r.state === "ready") return "можно";
  return `${r.percent} %`;
}

function Figure({
  parts,
  byGroup,
  selected,
  onSelect,
  label,
}: {
  parts: BodyPart[];
  byGroup: Map<MuscleGroup, GroupRecovery>;
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup) => void;
  label: string;
}) {
  return (
    <figure className="flex flex-col items-center gap-1">
      {/* Декоративно: то же самое — текстом в списке групп рядом */}
      <svg viewBox="0 0 100 200" className="h-56 w-auto sm:h-64" aria-hidden>
        {parts.map((part, i) => {
          const r = part.group ? byGroup.get(part.group) : undefined;
          return part.points.map((points, j) => (
            <polygon
              key={`${i}:${j}`}
              points={points}
              onClick={part.group ? () => onSelect(part.group!) : undefined}
              className={cn(
                "transition-[fill,opacity] duration-300 motion-reduce:transition-none",
                r ? [RECOVERY_FILL[r.state], "cursor-pointer"] : "fill-foreground/10",
                selected && part.group !== selected && "opacity-35",
              )}
              data-group={part.group ?? undefined}
              data-state={r?.state}
            />
          ));
        })}
      </svg>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** Восстановление групп мышц: силуэт спереди/сзади + список (тот же смысл текстом). */
export function BodyMap({ recovery, className }: { recovery: GroupRecovery[]; className?: string }) {
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const byGroup = new Map(recovery.map((r) => [r.group, r]));
  const toggle = (g: MuscleGroup) => setSelected((s) => (s === g ? null : g));

  const names = (state: RecoveryState) => recovery.filter((r) => r.state === state);
  const ready = names("ready");
  const neglected = names("neglected").filter((r) => r.daysSince !== null);
  const summary = [
    ready.length ? `Можно нагружать: ${ready.map((r) => MUSCLE_GROUP_LABELS[r.group].toLowerCase()).join(", ")}` : null,
    neglected.length
      ? `Давно не было: ${neglected.map((r) => `${MUSCLE_GROUP_LABELS[r.group].toLowerCase()} (${r.daysSince} дн.)`).join(", ")}`
      : null,
  ].filter(Boolean);
  const hint = selected ? recoveryHint(byGroup.get(selected)!) : summary.join(" · ") || "Начните тренироваться — здесь появится карта нагрузки";

  return (
    <section aria-labelledby="recovery-title" className={cn("rounded-xl border bg-card p-4", className)} data-testid="body-map">
      <h2 id="recovery-title" className="flex items-center gap-2 font-bold">
        <Activity className="size-4 text-primary" />
        Восстановление мышц
      </h2>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground" aria-live="polite" data-testid="recovery-hint">
        {hint}
      </p>

      <div className="mt-3 grid items-center gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center gap-2">
          <Figure parts={BODY_FRONT} byGroup={byGroup} selected={selected} onSelect={toggle} label="Спереди" />
          <Figure parts={BODY_BACK} byGroup={byGroup} selected={selected} onSelect={toggle} label="Сзади" />
        </div>

        <div className="space-y-3">
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
            {recovery.map((r) => (
              <li key={r.group}>
                <button
                  type="button"
                  onClick={() => toggle(r.group)}
                  aria-pressed={selected === r.group}
                  title={recoveryHint(r)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    selected === r.group && "border-primary bg-primary/10",
                  )}
                  data-testid={`recovery-${r.group}`}
                  data-state={r.state}
                >
                  <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", RECOVERY_DOT[r.state])} />
                  <span className="min-w-0 flex-1 truncate">{MUSCLE_GROUP_LABELS[r.group]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{shortStatus(r)}</span>
                  <span className="sr-only">— {recoveryHint(r)}</span>
                </button>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Легенда">
            {ORDER.map((state) => (
              <li key={state} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2.5 rounded-full", RECOVERY_DOT[state])} />
                {RECOVERY_STATE_LABELS[state]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
