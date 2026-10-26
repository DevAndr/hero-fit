"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptAction, declineAction } from "@/lib/together/actions";

/** Кнопки приглашения: «Присоединиться» — к своей тренировке или на экран старта (оба на /training). */
export function InviteActions({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [declined, setDeclined] = useState(false);

  const accept = () =>
    startTransition(async () => {
      const res = await acceptAction(sessionId);
      if (!res.ok) return void toast.error(res.error);
      router.push("/training");
    });
  const decline = () =>
    startTransition(async () => {
      await declineAction(sessionId);
      setDeclined(true);
    });

  if (declined) return <p className="text-sm text-muted-foreground">Приглашение отклонено</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} onClick={accept}>
        Присоединиться
      </Button>
      <Button variant="outline" disabled={pending} onClick={decline}>
        Отклонить
      </Button>
    </div>
  );
}
