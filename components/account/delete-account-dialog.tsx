"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { prunePain } from "@/components/assistant/pain-store";
import { PAGES_CACHE } from "@/components/training/offline-store";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/lib/account/actions";

/** Блок «Удаление аккаунта» в настройках: сразу и навсегда, подтверждение паролем (без пароля — логином). */
export function DeleteAccount({ hasPassword, preview }: { hasPassword: boolean; preview: string[] }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = hasPassword ? "Пароль" : "Логин";

  const submit = () =>
    start(async () => {
      // Следы на устройстве — как при выходе: копии страниц для офлайна и данные помощника о боли
      prunePain(null);
      if (typeof caches !== "undefined") await caches.delete(PAGES_CACHE).catch(() => false);
      const r = await deleteAccountAction(hasPassword ? { password: secret } : { confirm: secret });
      // Успех — redirect на лендинг; сюда приходит только отказ
      if (r && !r.ok) setError(r.error);
    });

  return (
    <section id="delete" aria-label="Удаление аккаунта" className="scroll-mt-20 space-y-3 rounded-xl border border-destructive/30 bg-card p-4">
      <h2 className="font-bold">Удаление аккаунта</h2>
      <p className="text-sm text-muted-foreground">
        Аккаунт и все данные удаляются сразу, восстановить нельзя.{" "}
        <a href="#data" className="text-primary hover:underline">
          Сначала скачать свои данные
        </a>
      </p>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          setSecret("");
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 />
        Удалить аккаунт
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить аккаунт?</AlertDialogTitle>
            <AlertDialogDescription>
              Пропадут тренировки, прогресс и ачивки, друзья, цели, гильдия и клуб. Восстановить нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {preview.length ? (
            <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              {preview.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Label htmlFor="delete-secret">{field}</Label>
            <Input
              id="delete-secret"
              type={hasPassword ? "password" : "text"}
              autoComplete={hasPassword ? "current-password" : "off"}
              value={secret}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "delete-error" : undefined}
              onChange={(e) => setSecret(e.target.value)}
            />
            {hasPassword ? null : <p className="text-xs text-muted-foreground">Введи свой логин, чтобы подтвердить.</p>}
            {error ? (
              <p id="delete-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <Button variant="destructive" disabled={pending || !secret.trim()} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Удалить навсегда
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
