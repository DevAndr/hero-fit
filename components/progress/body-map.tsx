"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { BODY_BACK, BODY_FRONT, type BodyPart } from "@/lib/progress/body-map-data";
import { BALANCE_DAYS, imbalanceHint, type GroupBalance, type Imbalance } from "@/lib/progress/balance";
import { plural } from "@/lib/format";
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

/** Баланс: 0 — ни разу за период, 1…4 — доля от самой нагруженной группы. */
const BALANCE_FILL = ["fill-muted-foreground/30", "fill-primary/25", "fill-primary/50", "fill-primary/75", "fill-primary"];
const BALANCE_DOT = ["bg-muted-foreground/40", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"];

type Mode = "recovery" | "balance";
export type MuscleBalanceData = { groups: GroupBalance[]; imbalances: Imbalance[]; untouched: MuscleGroup[] };

/** Короткий статус для списка: «60 %», «можно», «9 дн.». */
function shortStatus(r: GroupRecovery) {
  if (r.state === "neglected") return r.daysSince === null ? "не было" : `${r.daysSince} дн.`;
  if (r.state === "ready") return "можно";
  return `${r.percent} %`;
}

const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function Figure({
  parts,
  fill,
  state,
  selected,
  onSelect,
  label,
}: {
  parts: BodyPart[];
  fill: (g: MuscleGroup) => string;
  state: (g: MuscleGroup) => string;
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup) => void;
  label: string;
}) {
  return (
    <figure className="flex flex-col items-center gap-1">
      {/* Декоративно: то же самое — текстом в списке групп рядом */}
      <svg viewBox="0 0 100 200" className="h-56 w-auto sm:h-64" aria-hidden>
        {parts.map((part, i) =>
          part.points.map((points, j) => (
            <polygon
              key={`${i}:${j}`}
              points={points}
              onClick={part.group ? () => onSelect(part.group!) : undefined}
              className={cn(
                "transition-[fill,opacity] duration-300 motion-reduce:transition-none",
                part.group ? [fill(part.group), "cursor-pointer"] : "fill-foreground/10",
                selected && part.group !== selected && "opacity-35",
              )}
              data-group={part.group ?? undefined}
              data-state={part.group ? state(part.group) : undefined}
            />
          )),
        )}
      </svg>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** Карта мышц: восстановление (по умолчанию) и баланс нагрузки за 30 дней. Силуэт декоративный — всё дублирует список. */
export function BodyMap({
  recovery,
  balance,
  views = ["recovery", "balance"],
  className,
}: {
  recovery: GroupRecovery[];
  /** Нужен, только если среди views есть «balance». */
  balance?: MuscleBalanceData;
  /** Один вид — без переключателя (дашборд v2 показывает только восстановление). */
  views?: Mode[];
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>(views[0]);
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const byGroup = new Map(recovery.map((r) => [r.group, r]));
  const balanceBy = new Map((balance?.groups ?? []).map((b) => [b.group, b]));
  const toggle = (g: MuscleGroup) => setSelected((s) => (s === g ? null : g));
  const lower = (g: MuscleGroup) => MUSCLE_GROUP_LABELS[g].toLowerCase();
  const balanceText = (b: GroupBalance) =>
    `${MUSCLE_GROUP_LABELS[b.group]}: ${num(b.sets)} ${plural(Math.round(b.sets), "подход", "подхода", "подходов")} за ${BALANCE_DAYS} дней`;

  let hint: string;
  if (mode === "recovery") {
    const ready = recovery.filter((r) => r.state === "ready");
    const neglected = recovery.filter((r) => r.state === "neglected" && r.daysSince !== null);
    const summary = [
      ready.length ? `Можно нагружать: ${ready.map((r) => lower(r.group)).join(", ")}` : null,
      neglected.length ? `Давно не было: ${neglected.map((r) => `${lower(r.group)} (${r.daysSince} дн.)`).join(", ")}` : null,
    ].filter(Boolean);
    hint = selected
      ? recoveryHint(byGroup.get(selected)!)
      : summary.join(" · ") || "Начните тренироваться — здесь появится карта нагрузки";
  } else if (selected) {
    hint = balanceText(balanceBy.get(selected)!);
  } else if (!balance || balance.untouched.length === balance.groups.length) {
    hint = `За ${BALANCE_DAYS} дней тренировок не было`;
  } else {
    const parts = [
      ...balance.imbalances.map(imbalanceHint),
      balance.untouched.length ? `Ни разу за ${BALANCE_DAYS} дней: ${balance.untouched.map(lower).join(", ")}` : null,
    ].filter(Boolean);
    hint = parts.join(" · ") || "Нагрузка распределена ровно";
  }

  const fill = (g: MuscleGroup) =>
    mode === "recovery" ? RECOVERY_FILL[byGroup.get(g)!.state] : BALANCE_FILL[balanceBy.get(g)!.level];
  const state = (g: MuscleGroup) => (mode === "recovery" ? byGroup.get(g)!.state : `level-${balanceBy.get(g)!.level}`);

  return (
    <section aria-labelledby="recovery-title" className={cn("rounded-xl border bg-card p-4", className)} data-testid="body-map" data-tour="body-map">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recovery-title" className="flex items-center gap-2 font-bold">
          <Activity className="size-4 text-primary" />
          Карта мышц
        </h2>
        {views.length > 1 ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="recovery">Восстановление</TabsTrigger>
              <TabsTrigger value="balance">Баланс за {BALANCE_DAYS} дней</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      <p className="mt-2 min-h-10 text-sm text-muted-foreground" aria-live="polite" data-testid="recovery-hint">
        {hint}
      </p>

      <div className="mt-3 grid items-center gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center gap-2">
          <Figure parts={BODY_FRONT} fill={fill} state={state} selected={selected} onSelect={toggle} label="Спереди" />
          <Figure parts={BODY_BACK} fill={fill} state={state} selected={selected} onSelect={toggle} label="Сзади" />
        </div>

        <div className="space-y-3">
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
            {recovery.map((r) => {
              const b = balanceBy.get(r.group)!;
              const text = mode === "recovery" ? recoveryHint(r) : balanceText(b);
              return (
                <li key={r.group}>
                  <button
                    type="button"
                    onClick={() => toggle(r.group)}
                    aria-pressed={selected === r.group}
                    title={text}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                      selected === r.group && "border-primary bg-primary/10",
                    )}
                    data-testid={`recovery-${r.group}`}
                    data-state={state(r.group)}
                  >
                    <span
                      aria-hidden
                      className={cn("size-2.5 shrink-0 rounded-full", mode === "recovery" ? RECOVERY_DOT[r.state] : BALANCE_DOT[b.level])}
                    />
                    <span className="min-w-0 flex-1 truncate">{MUSCLE_GROUP_LABELS[r.group]}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {mode === "recovery" ? shortStatus(r) : `${num(b.sets)} подх.`}
                    </span>
                    <span className="sr-only">— {text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {mode === "recovery" ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Легенда">
              {ORDER.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-2.5 rounded-full", RECOVERY_DOT[s])} />
                  {RECOVERY_STATE_LABELS[s]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Меньше
              {BALANCE_DOT.map((c) => (
                <span key={c} aria-hidden className={cn("size-2.5 rounded-full", c)} />
              ))}
              больше · основная группа упражнения — 1 подход, второстепенная — 0,5
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
