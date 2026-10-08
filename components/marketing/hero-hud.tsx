import { Check, Flame, Timer, Trophy } from "lucide-react";
import { LevelHud } from "@/components/marketing/infographics";

const SETS = [
  { w: 80, r: 8, done: true },
  { w: 90, r: 6, done: true },
  { w: 100, r: 5, done: true },
  { w: 100, r: 5, done: false },
];

/** Герой лендинга: «экран тренировки» с плавающими виджетами уровня, серии и рекорда. */
export function HeroHud() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" />
      <div className="hf-rise rounded-2xl border bg-card/95 p-5 pb-16 shadow-2xl backdrop-blur" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Тренировка · 42:18</p>
            <p className="font-display text-lg font-bold">Грудь и трицепс</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            <Timer className="size-3.5" /> отдых 1:12
          </span>
        </div>
        <div className="mt-4 rounded-xl border bg-background/60 p-3">
          <p className="font-semibold">Жим штанги лёжа</p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {SETS.map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1 tabular-nums">
                  {s.w} кг × {s.r}
                </span>
                <span className={s.done ? "flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground" : "size-6 rounded-md border"}>
                  {s.done ? <Check className="size-4" /> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <LevelHud className="hf-rise absolute -bottom-10 left-4 w-56 sm:-left-8" />
      <div className="hf-float absolute -top-12 left-1/3 sm:-top-10">
        <div className="hf-rise flex items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg" style={{ animationDelay: "0.5s" }}>
          <Trophy className="size-5 text-xp" />
          <div className="text-xs">
            <p className="font-semibold">Новый рекорд!</p>
            <p className="text-muted-foreground">Жим 100 кг · +25 XP</p>
          </div>
        </div>
      </div>
      <div className="hf-rise absolute -bottom-5 right-4 flex items-center gap-1.5 rounded-full border bg-card/95 px-3 py-1.5 text-sm font-semibold shadow-lg sm:-right-6" style={{ animationDelay: "0.7s" }}>
        <Flame className="hf-flicker size-4 text-streak" /> 4 недели в ударе
      </div>
    </div>
  );
}
