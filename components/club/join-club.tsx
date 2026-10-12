"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
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
import { joinClubAction, leaveClubAction } from "@/lib/club/actions";

/** «Вступить»: сразу, ошибка (бан, клуб скрыт) — под кнопкой. */
export function JoinClubButton({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinClubAction(clubId);
            if (!r.ok) return setError(r.error);
            toast.success("Добро пожаловать в клуб");
            router.push(`/clubs/${clubId}`);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        Вступить
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LeaveClubButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LogOut />
        Выйти из клуба
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из клуба?</AlertDialogTitle>
            <AlertDialogDescription>Ты пропадёшь из рейтинга и ленты клуба. Вернуться можно в любой момент.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await leaveClubAction();
                  if (!r.ok) return void toast.error(r.error);
                  setOpen(false);
                  router.push("/clubs?list=1");
                })
              }
            >
              Выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
