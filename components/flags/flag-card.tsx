"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { deleteStaleFlagAction, saveFlagAction } from "@/lib/flags/actions";
import type { FlagPatch } from "@/lib/flags/schema";
import type { FlagAdminRow } from "@/lib/flags/server";
import { cn } from "@/lib/utils";

const STEPS = [0, 1, 5, 10, 25, 50, 100];
const when = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FlagCard({ flag }: { flag: FlagAdminRow }) {
  const [pending, startTransition] = useTransition();
  const [user, setUser] = useState("");
  const [percent, setPercent] = useState(String(flag.state.percent));
  const save = (patch: FlagPatch, after?: () => void) =>
    startTransition(async () => {
      const r = await saveFlagAction(flag.key, patch);
      if (!r.ok) return void toast.error(r.error);
      after?.();
    });

  return (
    <article aria-label={flag.key} className="space-y-4 rounded-xl border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-mono font-bold">{flag.key}</h2>
          <p className="text-sm text-muted-foreground">{flag.description}</p>
          <p className={cn("flex items-center gap-1.5 text-xs", flag.expired ? "text-streak" : "text-muted-foreground")}>
            {flag.expired ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
            {flag.expired ? `Пора удалить из кода (срок ${flag.expires})` : `Удалить из кода до ${flag.expires}`}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          Включён
          <Switch aria-label="Включён" checked={flag.state.enabled} disabled={pending} onCheckedChange={(v) => save({ enabled: v })} />
        </label>
      </header>

      <div className="space-y-2">
        <p className="text-sm font-medium">Доля пользователей</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {STEPS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={flag.state.percent === p ? "default" : "outline"}
              aria-pressed={flag.state.percent === p}
              disabled={pending}
              onClick={() => save({ percent: p }, () => setPercent(String(p)))}
            >
              {p} %
            </Button>
          ))}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              save({ percent: Number(percent) });
            }}
          >
            <Input aria-label="Процент" inputMode="numeric" className="w-20" value={percent} onChange={(e) => setPercent(e.target.value)} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Задать
            </Button>
          </form>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Всегда включён у</p>
        {flag.users.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {flag.users.map((u) => (
              <li key={u.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-sm">
                {u.label}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Убрать ${u.label}`}
                  disabled={pending}
                  onClick={() => save({ removeUserId: u.id })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save({ addUser: user }, () => setUser(""));
          }}
        >
          <Input aria-label="Логин или ник" placeholder="Логин или ник" value={user} onChange={(e) => setUser(e.target.value)} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Добавить
          </Button>
        </form>
      </div>

      <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span data-testid="flag-reach">Сейчас у ≈ {flag.reach}</span>
        {flag.state.updatedBy && flag.state.updatedAt ? (
          <span>
            Изменил: {flag.state.updatedBy} · {when.format(flag.state.updatedAt)}
          </span>
        ) : (
          <span>Ещё не настраивался</span>
        )}
      </footer>
    </article>
  );
}

export function StaleFlag({ flagKey }: { flagKey: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="font-mono">{flagKey}</span>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => startTransition(() => deleteStaleFlagAction(flagKey))}>
        Удалить строку
      </Button>
    </li>
  );
}
