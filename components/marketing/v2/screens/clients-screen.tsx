import { cn } from "@/lib/utils";

/** Только те подписи, что есть в настоящем списке клиентов (components/coach/client-list.tsx, SIGNAL_LABELS). */
const CLIENTS: { name: string; line: string; chips: { text: string; tone?: "alert" | "warn" | "good" }[] }[] = [
  { name: "Анна", line: "LVL 14 · последняя тренировка: сегодня", chips: [{ text: "Нед. 3/8" }, { text: "2 из 3 на неделе", tone: "good" }] },
  { name: "Максим", line: "LVL 6 · последняя тренировка: 9 дн. назад", chips: [{ text: "7+ дней без тренировок", tone: "alert" }] },
  { name: "Ольга", line: "LVL 21 · последняя тренировка: вчера", chips: [{ text: "Пора увеличить вес: 2", tone: "good" }] },
  { name: "Дима", line: "LVL 9 · последняя тренировка: 3 дн. назад", chips: [{ text: "Застой на весе", tone: "warn" }, { text: "план 2/3" }] },
];

const TONE = {
  alert: "bg-destructive/10 text-destructive",
  warn: "bg-streak/10 text-streak",
  good: "bg-primary/10 text-primary",
} as const;

/** Макет «Клиенты» тренера: строки с сигналами и подсказками, как в приложении. */
export function ClientsScreen() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-bold">Клиенты</p>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">4 активных</span>
      </div>
      <ul className="grid gap-2">
        {CLIENTS.map((c) => (
          <li key={c.name} className="rounded-2xl border bg-card p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{c.name[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{c.line}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {c.chips.map((chip) => (
                <span key={chip.text} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", chip.tone ? TONE[chip.tone] : "bg-muted text-muted-foreground")}>
                  {chip.text}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
