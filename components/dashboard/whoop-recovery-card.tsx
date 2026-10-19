import Link from "next/link";
import { Activity, HeartPulse, Moon, Watch } from "lucide-react";
import { WhoopRefreshButton } from "@/components/dashboard/whoop-refresh-button";
import { AllowRecoveryButton } from "@/components/whoop/allow-recovery-button";
import { RecoveryRing } from "@/components/whoop/recovery-ring";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { zoneText } from "@/lib/whoop/recovery";
import type { WhoopRecoveryView } from "@/lib/whoop/queries";

function Stat({ icon: Icon, label, value }: { icon: typeof Watch; label: string; value: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border p-2.5">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Карточка «Восстановление · WHOOP» перед картой мышц; `view` приходит только при подключённом WHOOP и флаге. */
export function WhoopRecoveryCard({ view }: { view: WhoopRecoveryView }) {
  return (
    <section aria-label="Восстановление WHOOP" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <Watch className="size-4 text-primary" />
          Восстановление · WHOOP
        </h2>
        {view.state === "empty" || view.state === "data" ? <WhoopRefreshButton /> : null}
      </div>

      {view.state === "no-access" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">WHOOP может показывать сон и восстановление — разрешите доступ</p>
          <AllowRecoveryButton />
        </div>
      ) : null}

      {view.state === "reauth" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-destructive">Переподключи WHOOP</p>
          <Link href="/devices" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Браслеты и часы
          </Link>
        </div>
      ) : null}

      {view.state === "empty" ? (
        <p className="text-sm text-muted-foreground">
          Данных за сегодня пока нет{view.yesterdayPct !== null ? ` · вчера: ${view.yesterdayPct} %` : ""}
        </p>
      ) : null}

      {view.state === "data" ? <Data view={view} /> : null}
    </section>
  );
}

function Data({ view }: { view: Extract<WhoopRecoveryView, { state: "data" }> }) {
  const sleep =
    view.sleepMs === null ? "—" : `${formatDuration(view.sleepMs / 1000)}${view.performancePct !== null ? ` · ${view.performancePct} %` : ""}`;
  return (
    <>
      <div className="flex items-center gap-4">
        <RecoveryRing pct={view.recoveryPct} zone={view.zone} />
        <div className="min-w-0 space-y-1">
          {view.pending ? (
            <p className="text-sm font-medium">WHOOP считает…</p>
          ) : view.zone ? (
            <p className="text-sm font-medium">{zoneText(view.zone)}</p>
          ) : null}
          {view.calibrating ? <p className="text-xs text-muted-foreground">WHOOP ещё калибруется — цифры приблизительные</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={Activity} label="HRV" value={view.hrvMs === null ? "—" : `${Math.round(view.hrvMs)} мс`} />
        <Stat icon={HeartPulse} label="Пульс покоя" value={view.restingHr === null ? "—" : `${view.restingHr} уд/мин`} />
        <Stat icon={Moon} label="Сон" value={sleep} />
      </div>
      {view.advice.length > 0 ? (
        <ul className="space-y-1.5">
          {view.advice.slice(0, 2).map((a) => (
            <li key={a.id} className="text-sm text-muted-foreground">
              {a.text}
              {a.href ? (
                <>
                  {" "}
                  <Link href={a.href} className="font-medium text-primary underline underline-offset-4">
                    Начать тренировку
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
