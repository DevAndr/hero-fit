"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EditClubButton } from "@/components/club/edit-club";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewClubAction, setClubHiddenAction } from "@/lib/club/admin-actions";
import type { ReviewClub } from "@/lib/club/queries";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

type Result = { ok: true } | { ok: false; error: string };

/** Заявка или одобренный клуб в модерации. */
export function ReviewCard({ club }: { club: ReviewClub }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(done);
      else toast.error(r.error);
    });
  return (
    <article aria-label={club.name} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold break-words">{club.name}</h2>
          <p className="text-sm text-muted-foreground">
            {club.city}, {club.address}
          </p>
        </div>
        {club.status === "HIDDEN" ? <Badge variant="secondary">Скрыт</Badge> : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Контакт</dt>
        <dd className="break-words">{club.contact}</dd>
        <dt className="text-muted-foreground">Заявитель</dt>
        <dd className="break-words">
          {club.applicant.login}
          {club.applicant.nickname ? ` · ${club.applicant.nickname}` : ""}
        </dd>
        <dt className="text-muted-foreground">{club.status === "PENDING" ? "Подана" : "Участников"}</dt>
        <dd>{club.status === "PENDING" ? dateFormat.format(new Date(club.createdAt)) : club.members}</dd>
      </dl>
      {club.similar.length ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">Похожие клубы</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {club.similar.map((s) => (
              <li key={s.id}>
                {s.name} — {s.address}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {club.status === "PENDING" ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => reviewClubAction(club.id, "approve"), "Клуб одобрен")}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Одобрить
            </Button>
            <RejectButton id={club.id} />
          </>
        ) : (
          <>
            <EditClubButton club={club} />
            {club.status === "APPROVED" ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setClubHiddenAction(club.id, true), "Клуб скрыт")}>
                Скрыть
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setClubHiddenAction(club.id, false), "Клуб возвращён")}>
                Вернуть
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function RejectButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Отклонить
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отклонить заявку</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${id}`}>Причина</Label>
            <Textarea id={`reason-${id}`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">Заявитель увидит её в уведомлении.</p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await reviewClubAction(id, "reject", reason);
                  if (!r.ok) return setError(r.error);
                  toast.success("Заявка отклонена");
                  setOpen(false);
                })
              }
            >
              Отклонить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
