import { Feather } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecoveryRing } from "@/components/whoop/recovery-ring";
import { zoneShort, type RecoveryZone } from "@/lib/whoop/recovery";
import type { WhoopRecoveryView } from "@/lib/whoop/queries";

/** Зона восстановления WHOOP за сегодня; null — показывать нечего (нет данных, считает, нужен доступ). */
export function whoopZone(view: WhoopRecoveryView | null | undefined): { zone: RecoveryZone; pct: number; advice: string | null } | null {
  if (view?.state !== "data" || !view.zone || view.recoveryPct === null) return null;
  return { zone: view.zone, pct: view.recoveryPct, advice: view.advice[0]?.text ?? null };
}

/**
 * Строка «Восстановление N % — …» на экране тренировки (старт и редактор): кольцо, текст зоны и самый важный совет.
 * Только при посчитанной зоне — настройки и «переподключи» живут на дашборде. `onLighten` — кнопка «Облегчить».
 */
export function RecoveryLine({ view, onLighten }: { view: WhoopRecoveryView | null | undefined; onLighten?: () => void }) {
  const z = whoopZone(view);
  if (!z) return null;
  return (
    <section aria-label="Восстановление WHOOP" className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
      <RecoveryRing pct={z.pct} zone={z.zone} size={44} textClassName="text-[0.65rem]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Восстановление {z.pct} % — {zoneShort(z.zone)}
        </p>
        {z.advice ? <p className="text-xs text-muted-foreground">{z.advice}</p> : null}
      </div>
      {onLighten ? (
        <Button size="sm" variant="outline" onClick={onLighten}>
          <Feather />
          Облегчить
        </Button>
      ) : null}
    </section>
  );
}
