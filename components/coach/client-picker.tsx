"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { addGroup, type CoachGroupView } from "@/lib/coach/groups";

export type PickerClient = { id: string; name: string; hint?: string };

/** Выбор клиентов (назначение нескольким, копирование плана): «Выбрать всех» и по галочке на клиента. */
export function ClientPicker({
  clients,
  picked,
  onChange,
  groups = [],
}: {
  clients: PickerClient[];
  picked: string[];
  onChange: (ids: string[]) => void;
  /** Кнопки групп: отмечают участников, которые есть в списке. */
  groups?: CoachGroupView[];
}) {
  const all = clients.length > 0 && picked.length === clients.length;
  const available = clients.map((c) => c.id);
  const usable = groups.filter((g) => g.clientIds.some((id) => available.includes(id)));
  return (
    <div role="group" aria-label="Клиенты" className="grid max-h-60 gap-2 overflow-y-auto rounded-lg border p-3">
      {usable.length ? (
        <div className="flex flex-wrap gap-1.5">
          {usable.map((g) => (
            <Button
              key={g.id}
              type="button"
              variant="secondary"
              size="xs"
              aria-label={`Отметить группу «${g.name}»`}
              onClick={() => onChange(addGroup(picked, g.clientIds, available))}
            >
              {g.name}
            </Button>
          ))}
        </div>
      ) : null}
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
