import type { ShopData } from "@/lib/shop/queries";
import { coinLabel, coinWord } from "@/lib/shop/labels";
import { cn } from "@/lib/utils";


/** Последние 50 записей журнала монет. */
export function CoinHistory({ history, timeZone }: { history: ShopData["history"]; timeZone: string }) {
  const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">История монет</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Пока пусто — завершите тренировку, и монеты появятся.</p>
      ) : (
        <ul className="mt-2 divide-y rounded-xl border bg-card" data-testid="coin-history">
          {history.map((t) => (
            <li key={t.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{coinLabel(t)}</span>
                <span className="text-xs text-muted-foreground">{dateFormat.format(t.createdAt)}</span>
              </span>
              <span className={cn("font-semibold whitespace-nowrap tabular-nums", t.amount > 0 ? "text-xp" : "text-muted-foreground")}>
                {t.amount > 0 ? "+" : "−"}
                {Math.abs(t.amount)} {coinWord(Math.abs(t.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
