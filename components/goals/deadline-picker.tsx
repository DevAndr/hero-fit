"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function plusMonths(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Срок цели: быстрые варианты и дата; null — без срока. `today` — местная дата пользователя. */
export function DeadlinePicker({ value, onChange, today, error }: { value: string | null; onChange: (v: string | null) => void; today: string; error?: string }) {
  const year = today.slice(0, 4);
  const endOfYear = today === `${year}-12-31` ? `${Number(year) + 1}-12-31` : `${year}-12-31`;
  const presets: [string, string | null][] = [
    ["Без срока", null],
    ["1 мес", plusMonths(today, 1)],
    ["3 мес", plusMonths(today, 3)],
    ["До конца года", endOfYear],
  ];
  return (
    <div className="space-y-2">
      <Label htmlFor="goal-deadline">Срок</Label>
      <div className="flex flex-wrap gap-2">
        {presets.map(([label, v]) => (
          <Button key={label} type="button" size="sm" variant={value === v ? "default" : "outline"} aria-pressed={value === v} onClick={() => onChange(v)}>
            {label}
          </Button>
        ))}
      </div>
      <Input
        id="goal-deadline"
        type="date"
        className="max-w-44"
        value={value ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "goal-deadline-error" : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {error ? (
        <p id="goal-deadline-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
