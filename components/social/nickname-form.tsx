"use client";

import { useState, useTransition } from "react";
import { AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setNicknameAction } from "@/lib/social/actions";

/** Публичный ник для рейтинга. Логин остаётся приватным — его никто не видит. */
export function NicknameForm({ initial, suggestion }: { initial: string | null; suggestion?: string }) {
  const [value, setValue] = useState(initial ?? suggestion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-label="Ник в рейтинге" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <AtSign className="size-4 text-primary" />
        Ник в рейтинге
      </h2>
      <p className="text-sm text-muted-foreground">
        Его видят только ваши друзья в недельной лиге. Логин для входа остаётся приватным.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await setNicknameAction(value);
            if (result.ok) {
              setError(null);
              toast.success("Ник сохранён");
            } else setError(result.error);
          });
        }}
      >
        <Input
          aria-label="Ник"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "nickname-error" : undefined}
          placeholder="например, iron_ivan"
          maxLength={20}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-60"
        />
        <Button type="submit" disabled={pending || !value.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </form>
      {error ? (
        <p id="nickname-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
