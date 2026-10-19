"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { parseNumber } from "@/components/training/workout-state";
import { dots, dotsLevel, wilks, type Sex } from "@/lib/progress/strength-score";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKg = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

const SEXES: { value: Sex; label: string }[] = [
  { value: "male", label: "Мужчина" },
  { value: "female", label: "Женщина" },
];

export function StrengthScoreCalculator() {
  const [sex, setSex] = useState<Sex>("male");
  const [bodyweight, setBodyweight] = useState("");
  const [squat, setSquat] = useState("");
  const [bench, setBench] = useState("");
  const [deadlift, setDeadlift] = useState("");
  const [sumOnly, setSumOnly] = useState(false);
  const [sum, setSum] = useState("");

  const bw = parseNumber(bodyweight);
  const total = sumOnly ? parseNumber(sum) : parseNumber(squat) + parseNumber(bench) + parseNumber(deadlift);
  const ready = bw > 0 && total > 0;
  const dotsScore = ready ? dots(total, bw, sex) : 0;
  const wilksScore = ready ? wilks(total, bw, sex) : 0;

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} {...selectOnFocus} />
    </label>
  );

  return (
    <section aria-label="Калькулятор DOTS и Wilks" className="card-glow rounded-2xl border p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-1 text-sm">
          <legend className="text-muted-foreground">Пол</legend>
          <div className="flex gap-2">
            {SEXES.map((s) => (
              <label
                key={s.value}
                className={cn(
                  "relative flex h-8 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  sex === s.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <input type="radio" name="strength-sex" value={s.value} checked={sex === s.value} onChange={() => setSex(s.value)} className="sr-only" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        {field("Вес тела, кг", bodyweight, setBodyweight, "80")}
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <Switch id="strength-sum-only" checked={sumOnly} onCheckedChange={setSumOnly} aria-label="Только сумма" />
        <label htmlFor="strength-sum-only" className="cursor-pointer">
          Только сумма
        </label>
      </div>

      <div className={cn("mt-4 grid gap-4", sumOnly ? "sm:grid-cols-1" : "sm:grid-cols-3")}>
        {sumOnly ? (
          field("Сумма, кг", sum, setSum, "500")
        ) : (
          <>
            {field("Присед, кг", squat, setSquat, "180")}
            {field("Жим лёжа, кг", bench, setBench, "120")}
            {field("Становая, кг", deadlift, setDeadlift, "200")}
          </>
        )}
      </div>

      <div className="mt-6" aria-live="polite">
        {ready ? (
          <div data-testid="strength-result" className="space-y-1">
            <p className="text-sm text-muted-foreground">Сумма {fmtKg(total)} кг</p>
            <p className="text-4xl font-black tabular-nums">DOTS {fmt(dotsScore)}</p>
            <p className="text-xl font-bold tabular-nums text-muted-foreground">Wilks {fmt(wilksScore)}</p>
            <p className="pt-2 text-sm">
              Уровень по DOTS: <strong>{dotsLevel(dotsScore)}</strong>
            </p>
            <p className="text-xs text-muted-foreground">Шкала уровней ориентировочная</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Введите вес тела и результаты в лифтах</p>
        )}
      </div>
    </section>
  );
}
