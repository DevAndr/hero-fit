"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
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
import { endOwnProgramAction } from "@/lib/catalog/actions";

/** Блок своей программы из каталога в календаре: неделя и «Завершить программу» (сегодняшняя тренировка остаётся). */
export function OwnProgram({ name, status }: { name: string; /** «неделя 3 из 8» */ status: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const end = () =>
    startTransition(async () => {
      const result = await endOwnProgramAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Программа завершена");
      setOpen(false);
    });

  return (
    <section aria-label="Программа" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
      <div className="min-w-0">
        <h2 className="truncate font-semibold">Программа «{name}»</h2>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Завершить программу
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить программу «{name}»?</AlertDialogTitle>
            <AlertDialogDescription>Будущие тренировки программы уйдут из календаря; сегодняшняя и прошедшие останутся.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={end}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Завершить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
