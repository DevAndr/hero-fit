"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { citySuggestionsAction } from "@/lib/club/actions";

/** Поиск клуба: обычная GET-форма (работает и без JS), город — с подсказками из одобренных клубов. */
export function ClubSearch({ city, q }: { city: string; q: string }) {
  const listId = useId();
  const [value, setValue] = useState(city);
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    const prefix = value.trim();
    if (prefix.length < 2) return;
    const timer = setTimeout(() => {
      citySuggestionsAction(prefix).then(setCities, () => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <form role="search" aria-label="Поиск клуба" action="/clubs" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="list" value="1" />
      <div className="space-y-1.5">
        <Label htmlFor="club-city">Город</Label>
        <Input id="club-city" name="city" list={listId} autoComplete="off" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} />
        <datalist id={listId}>
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="club-q">Название или адрес</Label>
        <Input id="club-q" name="q" defaultValue={q} maxLength={60} />
      </div>
      <Button type="submit">Найти</Button>
    </form>
  );
}
