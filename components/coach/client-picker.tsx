"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type PickerClient = { id: string; name: string; hint?: string };

/** Выбор клиентов (назначение нескольким, копирование плана): «Выбрать всех» и по галочке на клиента. */
export function ClientPicker({ clients, picked, onChange }: { clients: PickerClient[]; picked: string[]; onChange: (ids: string[]) => void }) {
  const all = clients.length > 0 && picked.length === clients.length;
  return (
    <div role="group" aria-label="Клиенты" className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border p-3">
      <Label className="flex items-center gap-2 font-semibold">
        {/* Без «частично»: наш Checkbox рисует ту же галочку — её легко принять за «отмечены все» */}
        <Checkbox checked={all} onCheckedChange={(v) => onChange(v === true ? clients.map((c) => c.id) : [])} />
        Выбрать всех
      </Label>
      {clients.map((c) => (
        <div key={c.id}>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={picked.includes(c.id)}
              aria-describedby={c.hint ? `pick-hint-${c.id}` : undefined}
              onCheckedChange={(v) => onChange(v === true ? [...picked, c.id] : picked.filter((id) => id !== c.id))}
            />
            {c.name}
          </Label>
          {c.hint ? (
            <p id={`pick-hint-${c.id}`} className="pl-6 text-xs text-muted-foreground">
              {c.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
