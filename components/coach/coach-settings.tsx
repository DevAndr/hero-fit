"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardList, UserCheck, UserSearch } from "lucide-react";
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
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { endCoachLinkAction, setCoachModeAction } from "@/lib/coach/actions";

/** /settings: режим тренера (нужен ник — по нему клиент узнаёт тренера). */
export function CoachModeCard({ initial, hasNickname }: { initial: boolean; hasNickname: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = (value: boolean) => {
    setOn(value);
    startTransition(async () => {
      const result = await setCoachModeAction(value);
      if (!result.ok) {
        setOn(!value);
        toast.error(result.error);
      } else {
        toast.success(value ? "Режим тренера включён — раздел «Клиенты» в меню" : "Режим тренера выключен");
      }
    });
  };

  return (
    <section aria-label="Режим тренера" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <ClipboardList className="size-4 text-primary" />
        Режим тренера
      </h2>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="coach-mode">Я тренер</FieldLabel>
          <FieldDescription>
            Раздел «Клиенты»: ссылка-приглашение, тренировки и прогресс клиентов. Свои тренировки остаются как были.
          </FieldDescription>
        </FieldContent>
        <Switch id="coach-mode" checked={on} disabled={pending || (!hasNickname && !on)} onCheckedChange={toggle} />
      </Field>
      {!hasNickname && !on ? (
        <p className="text-sm text-muted-foreground">
          Сначала задайте ник — по нему клиенты узнают тренера.{" "}
          <Link href="/friends" className="text-primary hover:underline">
            Задать ник
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/** /settings: тренера нет — ссылка на каталог тренеров. */
export function FindCoachCard() {
  return (
    <section aria-label="Найти тренера" className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <UserSearch className="size-4 text-primary" />
        Найти тренера
      </h2>
      <p className="text-sm text-muted-foreground">У вас пока нет тренера. В каталоге — тренеры по городу, формату и специализации.</p>
      <Link href="/trainers" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Найти тренера в каталоге
      </Link>
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** /settings: «Мой тренер» — только при активной связи. */
export function MyCoachCard({ name, since }: { name: string; since: Date }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const disconnect = () =>
    startTransition(async () => {
      try {
        await endCoachLinkAction();
        setOpen(false);
        toast.success("Тренер больше не видит ваши тренировки");
      } catch {
        // Нет сети — без падения страницы, связь не тронута
        setOpen(false);
        toast.error("Не удалось отключить тренера — проверьте связь");
      }
    });

  return (
    <section aria-label="Мой тренер" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <UserCheck className="size-4 text-primary" />
        Мой тренер
      </h2>
      <p className="text-sm">
        <span className="font-semibold">{name}</span>
        <span className="text-muted-foreground"> · видит ваши тренировки с {dateFormat.format(since)}</span>
      </p>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Отключить тренера
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить тренера {name}?</AlertDialogTitle>
            <AlertDialogDescription>Тренер сразу потеряет доступ к вашим тренировкам и статистике.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={disconnect} disabled={pending}>
              Отключить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
