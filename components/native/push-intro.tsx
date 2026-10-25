"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
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
import { useFlag } from "@/components/flags/flags-provider";
import { usePush } from "@/components/notifications/push-provider";

/** Показан ли диалог (localStorage этого телефона) — один раз на установку. */
const KEY = "hero-push-intro";
const noopSubscribe = () => () => {};

function seen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
}

/**
 * Android-приложение, первый запуск: «Включите уведомления». ntfy уже настроен — сразу «Включить», иначе — инструкция
 * /android. Один раз; в браузере и без флага native_app — никогда.
 */
export function NativePushIntro() {
  const push = usePush();
  const enabled = useFlag("native_app");
  // На сервере и до гидрации — «уже показан», чтобы не мигать
  const alreadySeen = useSyncExternalStore(noopSubscribe, seen, () => true);
  const [dismissed, setDismissed] = useState(false);
  const ready = Boolean(push?.native && enabled && push.ready && push.available);
  const open = ready && !push?.subscribed && push?.nativeReason !== "server-off" && !alreadySeen && !dismissed;

  if (!push) return null;
  const close = () => {
    markSeen();
    setDismissed(true);
  };
  // Можно включить сразу: ntfy стоит, сервер свой, разрешение не запрещено
  const direct = push.nativeReason === null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Включите уведомления</AlertDialogTitle>
          <AlertDialogDescription>
            Таймер отдыха, серия и ачивки будут приходить, даже когда Hero Fit закрыт.
            {direct ? null : " Понадобится бесплатное приложение ntfy — покажем, как подключить."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>Позже</AlertDialogCancel>
          {direct ? (
            <AlertDialogAction
              disabled={push.busy}
              onClick={async () => {
                close();
                if (await push.subscribe()) toast.success("Push включён");
                else toast.error("Не удалось включить push — подробности в настройках");
              }}
            >
              <BellRing />
              Включить
            </AlertDialogAction>
          ) : (
            <Link href="/android" onClick={close} className={buttonVariants()}>
              Как подключить
            </Link>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
