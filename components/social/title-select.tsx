"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setTitleAction } from "@/lib/titles/actions";
import type { Title } from "@/lib/titles/catalog";

/** Титул рядом с ником: выбор из открытых. */
export function TitleSelect({ titles, current, nickname }: { titles: Title[]; current: string | null; nickname: string | null }) {
  const [value, setValue] = useState<string | null>(titles.some((t) => t.code === current) ? current : null);
  const [pending, startTransition] = useTransition();
  const label = titles.find((t) => t.code === value)?.label;

  return (
    <section id="title" aria-label="Титул" className="scroll-mt-20 space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Crown className="size-4 text-xp" />
        Титул
      </h2>
      {titles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Титулы открываются за победы над боссами и вершины ачивок.{" "}
          <Link href="/achievements?tab=bestiary" className="text-foreground underline underline-offset-2">
            Бестиарий
          </Link>
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Виден друзьям рядом с ником — в лиге, ленте и списке друзей.</p>
          <div className="grid gap-1.5">
            <Label htmlFor="title-select">Титул</Label>
            <Select
              items={[{ value: null, label: "Без титула" }, ...titles.map((t) => ({ value: t.code, label: t.label }))]}
              value={value}
              disabled={pending}
              onValueChange={(next: string | null) => {
                const prev = value;
                setValue(next);
                startTransition(async () => {
                  const result = await setTitleAction(next);
                  if (result.ok) toast.success("Титул сохранён");
                  else {
                    setValue(prev);
                    toast.error(result.error);
                  }
                });
              }}
            >
              <SelectTrigger id="title-select" className="w-full max-w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Без титула</SelectItem>
                {titles.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm">
            <span className="font-semibold">{nickname ?? "Ваш ник"}</span>
            {label ? <span className="text-muted-foreground"> · {label}</span> : null}
          </p>
        </>
      )}
    </section>
  );
}
