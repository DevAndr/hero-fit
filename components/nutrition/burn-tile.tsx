import { Flame } from "lucide-react";

/** Сводка тренировки без WHOOP: оценка расхода по MET и весу тела. */
export function BurnTile({ kcal }: { kcal: number }) {
  return (
    <section aria-label="Расход калорий" className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <Flame className="size-5 text-streak" aria-hidden />
      <div>
        <p className="text-xs text-muted-foreground">Ккал</p>
        <p className="text-lg font-bold tabular-nums">≈ {kcal.toLocaleString("ru-RU")}</p>
      </div>
      <p className="ml-auto text-right text-xs text-muted-foreground">оценка по времени и весу тела</p>
    </section>
  );
}
