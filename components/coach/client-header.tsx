"use client";

import { useState, useTransition } from "react";
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
import { removeClientAction } from "@/lib/coach/actions";

/** «Удалить клиента» с подтверждением. */
export function RemoveClientButton({ clientId, name }: { clientId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Удалить клиента
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить клиента {name}?</AlertDialogTitle>
            <AlertDialogDescription>Вы потеряете доступ к тренировкам клиента, он получит уведомление.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => startTransition(() => removeClientAction(clientId))}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
