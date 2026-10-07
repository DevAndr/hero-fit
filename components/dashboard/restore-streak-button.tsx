"use client";

import { useTransition } from "react";
import { Flame, Loader2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { restoreStreakAction } from "@/lib/progress/actions";
import { weeksText } from "@/lib/progress/streak-copy";


export function RestoreStreakButton({ streak, cost, missing }: { streak: number; cost: number; missing: number }) {
  const [pending, startTransition] = useTransition();

  if (missing > 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Вернуть серию стоит {cost} XP — в текущем уровне не хватает {missing} XP
      </p>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" className="mt-2 bg-streak text-background hover:bg-streak/90" />}>
        <Flame />
        Вернуть {weeksText(streak)} за {cost} XP
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вернуть серию {weeksText(streak)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Спишем {cost} XP (уровень не понизится). Пропущенная неделя будет закрыта — сделайте 3 тренировки до
            воскресенья, чтобы продлить серию.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await restoreStreakAction();
                if (result.ok) toast.success(`Серия ${weeksText(result.streak)} снова горит 🔥`);
                else toast.error(result.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Вернуть за {cost} XP
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
