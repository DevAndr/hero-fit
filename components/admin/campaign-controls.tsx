"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Pause, Play, Send, Trash2, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CampaignStatus } from "@/generated/prisma/enums";
import { audienceAction, deleteCampaignAction, setCampaignStatusAction, testSendAction } from "@/lib/campaigns/admin-actions";
import { plural } from "@/lib/format";

/** Кнопки рассылки по статусу: аудитория, тест себе, запуск, пауза, архив, удаление черновика. */
export function CampaignControls({ id, status }: { id: string; status: CampaignStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [launch, setLaunch] = useState<{ count: number | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const say = (text: string, error = false) => setMessage({ text, error });
  const setStatus = (next: CampaignStatus) =>
    startTransition(async () => {
      const r = await setCampaignStatusAction(id, next);
      setLaunch(null);
      if (!r.ok) return void say(r.error, true);
      setMessage(null);
    });
  const count = launch?.count ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await audienceAction(id);
              if (!r.ok) return void say(r.error, true);
              say(`Сейчас подходят: ${r.count}`);
            })
          }
        >
          <Users />
          Кто попадёт сейчас
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await testSendAction(id);
              say(r.ok ? "Отправлено вам: смотрите колокольчик" : r.error, !r.ok);
            })
          }
        >
          <Send />
          Отправить себе
        </Button>
        {status === "DRAFT" || status === "PAUSED" ? (
          <Button
            disabled={pending}
            onClick={() => {
              setLaunch({ count: null });
              startTransition(async () => {
                const r = await audienceAction(id);
                if (!r.ok) {
                  setLaunch(null);
                  return void say(r.error, true);
                }
                setLaunch({ count: r.count });
              });
            }}
          >
            <Play />
            {status === "PAUSED" ? "Возобновить" : "Запустить"}
          </Button>
        ) : null}
        {status === "ACTIVE" ? (
          <Button variant="secondary" disabled={pending} onClick={() => setStatus("PAUSED")}>
            <Pause />
            Пауза
          </Button>
        ) : null}
        {status === "ACTIVE" || status === "PAUSED" ? (
          <Button variant="outline" disabled={pending} onClick={() => setStatus("ARCHIVED")}>
            <Archive />
            В архив
          </Button>
        ) : null}
        {status === "DRAFT" ? (
          <Button variant="destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
            <Trash2 />
            Удалить
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
      {status === "ARCHIVED" ? <p className="text-sm text-muted-foreground">Рассылка в архиве: запустить её снова нельзя.</p> : null}

      <AlertDialog open={launch !== null} onOpenChange={(open) => !open && setLaunch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Запустить рассылку?</AlertDialogTitle>
            <AlertDialogDescription>
              {count === null ? "Считаем, кто подходит…" : `Сейчас подходят ${count} ${plural(count, "человек", "человека", "человек")}.`} Отправка пойдёт в выбранный час по местному времени игрока.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <Button disabled={pending || count === null} onClick={() => setStatus("ACTIVE")}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Запустить
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить рассылку?</AlertDialogTitle>
            <AlertDialogDescription>Черновик исчезнет без возврата.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteCampaignAction(id);
                  setConfirmDelete(false);
                  if (!r.ok) return void say(r.error, true);
                  router.push("/admin/campaigns");
                })
              }
            >
              Удалить
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
