import { AlertTriangle, Trophy } from "lucide-react";

const CLIENTS = [
  { name: "Анна", note: "Тренировка сегодня · 18:00", signal: null },
  { name: "Максим", note: "7 дней без тренировок", signal: "warn" },
  { name: "Ольга", note: "Новый рекорд: тяга 110 кг", signal: "record" },
  { name: "Дима", note: "Неделя 3 из 8 · программа «Сила»", signal: null },
  { name: "Катя", note: "Оценила тренировку: тяжело", signal: null },
] as const;

/** Макет «Клиенты» тренера: список с сигналами. */
export function ClientsScreen() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-bold">Клиенты</p>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">5 активных</span>
      </div>
      <ul className="grid gap-2">
        {CLIENTS.map((c) => (
          <li key={c.name} className="flex items-center gap-2.5 rounded-2xl border bg-card p-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{c.name[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{c.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{c.note}</span>
            </span>
            {c.signal === "warn" ? <AlertTriangle className="size-4 shrink-0 text-streak" /> : null}
            {c.signal === "record" ? <Trophy className="size-4 shrink-0 text-xp" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
