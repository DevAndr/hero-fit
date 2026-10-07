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

const days = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
};

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
        Вернуть {days(streak)} за {cost} XP
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вернуть серию {days(streak)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Спишем {cost} XP (уровень не понизится). После этого у вас будут сутки, чтобы потренироваться и продлить
            серию.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await restoreStreakAction();
                if (result.ok) toast.success(`Серия ${days(result.streak)} снова горит 🔥`);
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
