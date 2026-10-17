"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
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

/** Согласие на обработку данных о здоровье — отдельное, обязательное перед переходом в WHOOP. */
function ConsentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setAgreed(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключить WHOOP</DialogTitle>
          <DialogDescription>Hero Fit получит из WHOOP данные о здоровье — нужно ваше согласие.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Какие данные:</span> тренировки WHOOP — время, вид спорта, средний и максимальный пульс,
            strain, ккал, время в пульсовых зонах.
          </li>
          <li>
            <span className="text-foreground">Зачем:</span> показ в сводке тренировки.
          </li>
          <li>
            <span className="text-foreground">Кто видит:</span> только вы.
          </li>
          <li>
            <span className="text-foreground">Срок:</span> пока WHOOP подключён.
          </li>
          <li>
            <span className="text-foreground">Как отозвать:</span> кнопка «Отключить WHOOP» — данные удаляются.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Подробнее — в{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4 hover:text-primary">
            политике конфиденциальности
          </Link>
          .
        </p>
        <Field orientation="horizontal">
          <Checkbox id="whoop-consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
          <FieldContent>
            <FieldLabel htmlFor="whoop-consent" className="font-normal">
              Согласен на обработку данных о здоровье
            </FieldLabel>
          </FieldContent>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
          {/* Обычная ссылка, не <Link>: маршрут уводит на авторизацию WHOOP полной навигацией */}
          <a
            href={agreed ? "/api/whoop/connect?consent=1" : undefined}
            role="link"
            aria-disabled={!agreed}
            className={cn(buttonVariants(), !agreed && "pointer-events-none opacity-50")}
          >
            Продолжить
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
