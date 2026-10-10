"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { createTelegramLinkAction, setTelegramNotifyAction, unlinkTelegramAction } from "@/lib/telegram/actions";
import type { TelegramStatus } from "@/lib/telegram/queries";

/** Привязка Telegram-бота: уведомления дублируются в Telegram (кроме таймера отдыха). */
export function TelegramCard({ status }: { status: Extract<TelegramStatus, { enabled: true }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notify, setNotify] = useState(status.notify);

  // Привязка завершается в Telegram — при возврате на вкладку подтягиваем новый статус
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const connect = () => {
    // Окно открываем сразу по клику — после await браузер счёл бы его всплывающим без действия пользователя
    const tab = window.open("", "_blank");
    start(async () => {
      const result = await createTelegramLinkAction();
      if ("error" in result) {
        tab?.close();
        toast.error(result.error);
        return;
      }
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    });
  };

  return (
    <section aria-label="Telegram" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Send className="size-4 text-primary" />
        Telegram
      </h2>
      {status.linked ? (
        <>
          <p className="text-sm text-muted-foreground">{status.username ? `Подключён @${status.username}` : "Подключён"}</p>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="pref-telegram">Присылать в Telegram</FieldLabel>
              <FieldDescription>Те же уведомления, что включены ниже, кроме таймера отдыха</FieldDescription>
            </FieldContent>
            <Switch
              id="pref-telegram"
              checked={notify}
              disabled={pending}
              onCheckedChange={(v) => {
                setNotify(v);
                start(() => setTelegramNotifyAction(v));
              }}
            />
          </Field>
          <Button variant="outline" disabled={pending} onClick={() => start(() => unlinkTelegramAction())}>
            <Unlink />
            Отключить
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Уведомления о тренере, плане, серии и друзьях — сообщением от бота. Откроется Telegram — нажмите «Start».
          </p>
          <Button disabled={pending} onClick={connect}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Подключить
          </Button>
        </>
      )}
    </section>
  );
}
