"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { InviteQr } from "@/components/club/invite-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { kickClubMemberAction, regenerateClubCodeAction, transferClubAction, unbanClubMemberAction } from "@/lib/club/actions";
import type { ClubManage } from "@/lib/club/queries";

type Result = { ok: true } | { ok: false; error: string };
type Confirm = { title: string; text: string; action: string; destructive?: boolean; run: () => Promise<Result>; done: string };

/** Подтверждение действия админа клуба — одно на страницу. */
function useConfirm() {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, start] = useTransition();
  const dialog = (
    <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant={confirm?.destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              confirm &&
              start(async () => {
                const r = await confirm.run();
                if (r.ok) toast.success(confirm.done);
                else toast.error(r.error);
                setConfirm(null);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {confirm?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { ask: setConfirm, dialog };
}

export function ClubInvite({ clubId, url }: { clubId: string; url: string }) {
  const { ask, dialog } = useConfirm();
  return (
    <section aria-label="Приглашение" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Приглашение</h2>
      <p className="text-sm text-muted-foreground">Распечатайте QR для ресепшена или отправьте ссылку — вступление сразу, без заявки.</p>
      <div className="flex flex-wrap items-start gap-4">
        <InviteQr url={url} size={160} />
        <div className="min-w-0 flex-1 space-y-2">
          <Input aria-label="Ссылка" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              ask({
                title: "Сменить ссылку?",
                text: "Старая ссылка и QR перестанут работать. Участники останутся в клубе.",
                action: "Сменить",
                run: () => regenerateClubCodeAction(clubId),
                done: "Ссылка обновлена",
              })
            }
          >
            <RefreshCw />
            Сменить ссылку
          </Button>
        </div>
      </div>
      {dialog}
    </section>
  );
}

export function ClubMembersManage({ clubId, meId, members, banned }: { clubId: string; meId: string; members: ClubManage["members"]; banned: ClubManage["banned"] }) {
  const [filter, setFilter] = useState("");
  const { ask, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const q = filter.trim().toLowerCase();
  const shown = q ? members.filter((m) => m.nickname.toLowerCase().includes(q)) : members;
  return (
    <section aria-label="Участники клуба" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Участники · {members.length}</h2>
      {members.length > 5 ? <Input aria-label="Поиск по нику" placeholder="Поиск по нику" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-64" /> : null}
      <ul aria-label="Участники" className="divide-y">
        {shown.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 break-words">
              {m.nickname}
              {m.id === meId ? <span className="text-muted-foreground"> (вы)</span> : null}
            </span>
            {m.id === meId ? null : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Исключить ${m.nickname}`}
                onClick={() =>
                  ask({
                    title: `Исключить ${m.nickname}?`,
                    text: "Он не сможет вступить снова, пока вы не разблокируете.",
                    action: "Исключить",
                    destructive: true,
                    run: () => kickClubMemberAction(clubId, m.id),
                    done: "Участник исключён",
                  })
                }
              >
                <UserMinus />
                Исключить
              </Button>
            )}
          </li>
        ))}
      </ul>
      {banned.length ? (
        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-semibold">Заблокированные</h3>
          <ul aria-label="Заблокированные" className="divide-y">
            {banned.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 break-words">{b.nickname}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await unbanClubMemberAction(clubId, b.id);
                      if (r.ok) toast.success("Разблокирован");
                      else toast.error(r.error);
                    })
                  }
                >
                  Разблокировать
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}

export function TransferClub({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Передать клуб"
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (nickname.trim()) setOpen(true);
      }}
    >
      <h2 className="font-bold">Передать клуб</h2>
      <p className="text-sm text-muted-foreground">Новый админ — участник клуба. Вы потеряете доступ к управлению.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-nick">Ник участника</Label>
          <Input id="transfer-nick" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">
          Передать
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Передать клуб {nickname.trim()}?</AlertDialogTitle>
            <AlertDialogDescription>Управлять клубом будет новый админ, вернуть права может только он.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await transferClubAction(clubId, nickname);
                  setOpen(false);
                  if (!r.ok) return setError(r.error);
                  toast.success("Клуб передан");
                  router.push(`/clubs/${clubId}`);
                })
              }
            >
              Передать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
