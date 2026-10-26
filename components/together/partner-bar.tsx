"use client";

import { useEffect, useState } from "react";
import { ChevronDown, EllipsisVertical, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/lib/format";
import type { SnapshotResponse } from "@/lib/together/response";
import { cn } from "@/lib/utils";

function InGym({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return <span>{formatDuration(Math.max(0, Math.floor((now - Date.parse(since)) / 1000)))} в зале</span>;
}

/** Полоса партнёра под шапкой тренировки: что он делает сейчас, 👊, раскрытие — вся его тренировка. */
export function PartnerBar({
  name,
  partner,
  offline,
  onCheer,
  onLeave,
}: {
  name: string;
  partner: SnapshotResponse["partner"];
  offline: boolean;
  onCheer: () => void;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const line = !partner
    ? "ещё не начал тренировку"
    : partner.finished
      ? "закончил тренировку"
      : partner.current
        ? `${partner.current.exercise} · ${partner.current.doneSets} из ${partner.current.totalSets} подходов`
        : "все подходы выполнены";

  return (
    <section role="region" aria-label="Партнёр" className={cn("basis-full rounded-lg border bg-muted/40 px-3 py-2 text-sm", offline && "opacity-60")}>
      <div className="flex items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0">
            <span className="block truncate font-semibold">Вместе с {name}</span>
            <span className="block truncate text-muted-foreground">
              {line}
              {partner?.startedAt && !partner.finished ? (
                <>
                  {" · "}
                  <InGym since={partner.startedAt} />
                </>
              ) : null}
              {offline ? " · нет связи" : null}
            </span>
          </span>
          <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
        <Button size="sm" variant="outline" aria-label="Отправить 👊" onClick={onCheer}>
          👊
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Совместная тренировка" />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onLeave}>Выйти из сессии</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && partner ? (
        <ul aria-label="Тренировка партнёра" className="mt-2 space-y-1.5 border-t pt-2">
          {partner.exercises.map((e, i) => {
            const done = e.sets.filter((s) => s.done);
            return (
              <li key={i}>
                <span className="font-medium">{e.name}</span>
                {e.record ? (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-xp">
                    <Trophy className="size-3" aria-hidden />
                    Рекорд
                  </span>
                ) : null}
                <span className="block text-muted-foreground tabular-nums">
                  {done.length
                    ? done.map((s) => (s.weight !== null && s.weight > 0 ? `${s.reps} × ${s.weight} кг` : `${s.reps} повторов`)).join(", ")
                    : `0 из ${e.sets.length} подходов`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
