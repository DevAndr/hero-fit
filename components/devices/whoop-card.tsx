"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Link2, Loader2, Unlink, Watch } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ConsentDialog } from "@/components/whoop/consent-dialog";
import { disconnectWhoopAction } from "@/lib/whoop/actions";
import type { WhoopNotice } from "@/lib/whoop/oauth";

/** Статус для карточки: даты уже отформатированы на сервере в поясе пользователя. */
export type WhoopCardStatus = { connected: false } | { connected: true; since: string; lastSync: string | null; needsReauth: boolean };

const NOTICE_TEXT: Record<WhoopNotice, { text: string; ok: boolean }> = {
  connected: { text: "WHOOP подключён", ok: true },
  denied: { text: "Подключение отменено", ok: false },
  taken: { text: "Этот аккаунт WHOOP уже подключён к другому профилю", ok: false },
  error: { text: "Не удалось подключить WHOOP", ok: false },
};

const BROWSER_ONLY = "Подключение WHOOP доступно в браузере";

/**
 * Подключение WHOOP: состояния «не подключён» / «подключён» / «нужно переподключить», согласие и отключение.
 * `embedded` (Telegram Mini App) — вместо подключения подсказка про браузер: OAuth во webview не пройти; отключить можно.
 */
export function WhoopCard({ status, notice, embedded = false }: { status: WhoopCardStatus; notice: WhoopNotice | null; embedded?: boolean }) {
  const [consentOpen, setConsentOpen] = useState(false);
  const shown = useRef(false);

  // Итог OAuth приходит параметром ?whoop= — один тост на заход
  useEffect(() => {
    if (!notice || shown.current) return;
    shown.current = true;
    const { text, ok } = NOTICE_TEXT[notice];
    if (ok) toast.success(text);
    else toast.error(text);
  }, [notice]);

  return (
    <section aria-label="WHOOP" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Watch className="size-4 text-primary" />
        WHOOP
      </h2>
      {!status.connected ? (
        <>
          <p className="text-sm font-medium">Не подключён</p>
          <p className="text-sm text-muted-foreground">
            Средний и максимальный пульс, strain и калории из WHOOP появятся в сводке тренировки.
          </p>
          {embedded ? (
            <p className="text-sm font-medium">{BROWSER_ONLY}</p>
          ) : (
            <Button onClick={() => setConsentOpen(true)}>
              <Link2 />
              Подключить WHOOP
            </Button>
          )}
        </>
      ) : (
        <>
          {status.needsReauth ? (
            <>
              <p className="text-sm font-medium text-destructive">Нужно переподключить</p>
              <p className="text-sm text-muted-foreground">WHOOP отозвал доступ — новые тренировки не загружаются.</p>
            </>
          ) : (
            <p className="text-sm font-medium">Подключён с {status.since}</p>
          )}
          <p className="text-sm text-muted-foreground">Последняя синхронизация: {status.lastSync ?? "ещё не было"}</p>
          <div className="flex flex-wrap gap-2">
            {status.needsReauth && embedded ? <p className="w-full text-sm font-medium">{BROWSER_ONLY}</p> : null}
            {status.needsReauth && !embedded ? (
              <Button onClick={() => setConsentOpen(true)}>
                <Link2 />
                Переподключить WHOOP
              </Button>
            ) : null}
            <DisconnectButton />
          </div>
        </>
      )}
      <ConsentDialog open={consentOpen} onOpenChange={setConsentOpen} />
    </section>
  );
}

function DisconnectButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Unlink />
        Отключить WHOOP
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить WHOOP?</AlertDialogTitle>
            <AlertDialogDescription>Данные WHOOP в Hero Fit удалятся</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await disconnectWhoopAction();
                  } catch {
                    toast.error("Не удалось отключить WHOOP, попробуйте ещё раз");
                    return;
                  }
                  setOpen(false);
                  toast.success("WHOOP отключён");
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Отключить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
