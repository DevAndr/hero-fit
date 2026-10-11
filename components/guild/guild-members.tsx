"use client";

import { useState, useTransition } from "react";
import { Copy, Crown, RefreshCw } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { kickMemberAction, leaveGuildAction, regenerateGuildCodeAction, transferLeadAction } from "@/lib/guild/actions";
import type { GuildMemberView } from "@/lib/guild/queries";

type Saved = { ok: true } | { ok: false; error: string };

/** Выполнить действие гильдии с тостом ошибки. */
function useGuildAction() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Saved>, done?: () => void) =>
    startTransition(async () => {
      let res: Saved;
      try {
        res = await action();
      } catch {
        toast.error("Не удалось — проверьте связь");
        return;
      }
      if (!res.ok) toast.error(res.error);
      else done?.();
    });
  return { pending, run };
}

type Confirm = { kind: "kick" | "lead"; member: GuildMemberView };

/** Состав: ник, титул, тренировки и опыт за неделю; главе — «Исключить» и «Сделать главой». */
export function GuildMembers({ members, meId, iLead }: { members: GuildMemberView[]; meId: string; iLead: boolean }) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { pending, run } = useGuildAction();
  return (
    <>
      <ul aria-label="Участники гильдии" className="divide-y divide-border/60 rounded-xl border bg-card">
        {members.map((m, i) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate">{m.nickname}</span>
                {m.isLeader ? (
                  <span className="flex items-center gap-0.5 rounded-full bg-xp/10 px-1.5 text-xs text-xp">
                    <Crown className="size-3" aria-hidden />
                    глава
                  </span>
                ) : null}
                {m.id === meId ? <span className="text-xs font-normal text-muted-foreground">(вы)</span> : null}
              </span>
              {m.title ? <span className="block pl-6.5 text-xs text-muted-foreground">{m.title}</span> : null}
            </span>
            <span className="flex items-center gap-3 text-sm tabular-nums">
              <span title="Тренировок на этой неделе">🏋️ {m.workouts}</span>
              <span className="font-semibold text-xp">{m.xp} XP</span>
              {iLead && m.id !== meId ? (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "lead", member: m })}>
                    Сделать главой
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "kick", member: m })}>
                    Исключить
                  </Button>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "kick" ? `Исключить ${confirm.member.nickname}?` : `Сделать главой ${confirm?.member.nickname}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "kick" ? "Участник получит уведомление и сможет вернуться только по ссылке." : "Вы останетесь в гильдии участником."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "kick" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (!confirm) return;
                const id = confirm.member.id;
                run(() => (confirm.kind === "kick" ? kickMemberAction(id) : transferLeadAction(id)), () => setConfirm(null));
              }}
            >
              {confirm?.kind === "kick" ? "Исключить" : "Сделать главой"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Ссылка-приглашение: копировать; главе — «Сменить ссылку». */
export function GuildInvite({ url, code, iLead }: { url: string; code: string; iLead: boolean }) {
  const { pending, run } = useGuildAction();
  return (
    <section aria-label="Пригласить" className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Пригласить</h2>
      <p className="text-sm text-muted-foreground">Отправьте ссылку — по ней вступают сразу. Код: <span className="font-mono">{code}</span></p>
      <div className="flex gap-2">
        <Input aria-label="Ссылка" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => toast.success("Ссылка скопирована"),
              () => toast.error("Не удалось скопировать"),
            );
          }}
        >
          <Copy />
          Копировать
        </Button>
      </div>
      {iLead ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(regenerateGuildCodeAction, () => toast.success("Старая ссылка больше не работает"))}>
          <RefreshCw />
          Сменить ссылку
        </Button>
      ) : null}
    </section>
  );
}

/** «Выйти из гильдии»; главе с участниками — объяснение вместо выхода. */
export function LeaveGuild({ blocked }: { blocked: string | null }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useGuildAction();
  return (
    <>
      <Button variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        Выйти из гильдии
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из гильдии?</AlertDialogTitle>
            <AlertDialogDescription>
              {blocked ?? "Вернуться можно только по ссылке-приглашению. Если вы последний — гильдия удалится."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{blocked ? "Понятно" : "Отмена"}</AlertDialogCancel>
            {blocked ? null : (
              <AlertDialogAction variant="destructive" disabled={pending} onClick={() => run(leaveGuildAction, () => setOpen(false))}>
                Выйти
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
