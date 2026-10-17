"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Flame, HeartPulse, Loader2, RefreshCw, Watch, Zap } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { refreshWhoopAction } from "@/lib/whoop/actions";
import type { WhoopCardState } from "@/lib/whoop/card";
import type { WhoopSummary } from "@/lib/whoop/match";

const ZONE_BG = ["bg-zone-0", "bg-zone-1", "bg-zone-2", "bg-zone-3", "bg-zone-4", "bg-zone-5"];

const NOTICE = {
  throttled: "Обновить можно через минуту",
  unavailable: "WHOOP не отвечает, попробуйте позже",
} as const;

const minutes = (ms: number) => Math.round(ms / 60_000);
const strainText = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Пульс, strain и ккал из WHOOP в сводке тренировки; «Обновить» догружает активности вокруг тренировки. */
export function WhoopCard({ workoutId, initial }: { workoutId: string; initial: WhoopCardState }) {
  const [state, setState] = useState(initial);
  const [notice, setNotice] = useState<keyof typeof NOTICE | null>(null);
  const [loading, start] = useTransition();
  const autoDone = useRef(false);

  function refresh(auto: boolean) {
    start(async () => {
      let res: Awaited<ReturnType<typeof refreshWhoopAction>>;
      try {
        res = await refreshWhoopAction(workoutId);
      } catch {
        res = { status: "unavailable" };
      }
      if (res.status === "ok") {
        setState(res.card);
        setNotice(null);
      } else if (res.status === "reauth") {
        setState({ kind: "reauth" });
        setNotice(null);
      } else if (res.status === "throttled") {
        // Автодогрузка сразу после подключения упирается в только что прошедшую синхронизацию — молчим
        if (!auto) setNotice("throttled");
      } else {
        setNotice("unavailable");
      }
    });
  }

  // Активности ещё нет, тренировка свежая — одна автоматическая догрузка при открытии
  useEffect(() => {
    if (initial.kind !== "waiting" || autoDone.current) return;
    autoDone.current = true;
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз на монтировании
  }, []);

  return (
    <section aria-label="WHOOP" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <Watch className="size-4 text-primary" />
          WHOOP
        </h2>
        {state.kind !== "reauth" ? (
          <Button variant="ghost" size="sm" onClick={() => refresh(false)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Обновить
          </Button>
        ) : null}
      </div>

      {state.kind === "data" ? <WhoopData summary={state.summary} /> : null}
      {state.kind === "pending" ? <p className="text-sm text-muted-foreground">WHOOP ещё обрабатывает тренировку</p> : null}
      {state.kind === "waiting" ? <p className="text-sm text-muted-foreground">Пока нет данных WHOOP</p> : null}
      {state.kind === "none" ? (
        <p className="text-sm text-muted-foreground">
          WHOOP не записал активность в это время. Автоопределение срабатывает не всегда — можно запускать активность в WHOOP
          вручную
        </p>
      ) : null}
      {state.kind === "reauth" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-destructive">Переподключите WHOOP</p>
          <Link href="/devices" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Браслеты и часы
          </Link>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {NOTICE[notice]}
        </p>
      ) : null}
    </section>
  );
}

function Tile({ icon: Icon, label, value, unit }: { icon: typeof Watch; label: string; value: string; unit?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border p-3">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-1 text-2xl font-black tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function WhoopData({ summary }: { summary: WhoopSummary }) {
  const total = summary.zonesMs.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={HeartPulse} label="Средний пульс" value={summary.avgHr === null ? "—" : String(summary.avgHr)} unit="уд/мин" />
        <Tile icon={HeartPulse} label="Макс. пульс" value={summary.maxHr === null ? "—" : String(summary.maxHr)} unit="уд/мин" />
        <Tile icon={Zap} label="Strain" value={strainText(summary.strain)} />
        <Tile icon={Flame} label="Ккал" value={summary.kcal === null ? "—" : summary.kcal.toLocaleString("ru-RU")} />
      </div>

      {total > 0 ? (
        <div>
          {/* Полоса и подписи — для глаз; скринридеру — таблица ниже */}
          <div aria-hidden="true">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {summary.zonesMs.map((ms, i) =>
                ms > 0 ? <div key={i} className={ZONE_BG[i]} style={{ width: `${(ms / total) * 100}%` }} /> : null,
              )}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {summary.zonesMs.map((ms, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${ZONE_BG[i]}`} />
                  Зона {i} · {minutes(ms)} мин
                </li>
              ))}
            </ul>
          </div>
          <div className="sr-only">
            <table>
              <caption>Время в пульсовых зонах</caption>
              <thead>
                <tr>
                  <th scope="col">Зона</th>
                  <th scope="col">Минуты</th>
                  <th scope="col">Доля</th>
                </tr>
              </thead>
              <tbody>
                {summary.zonesMs.map((ms, i) => (
                  <tr key={i}>
                    <th scope="row">Зона {i}</th>
                    <td>{minutes(ms)} мин</td>
                    <td>{Math.round((ms / total) * 100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {summary.fragments > 1 ? <p className="text-xs text-muted-foreground">по {summary.fragments} активностям WHOOP</p> : null}
    </>
  );
}
