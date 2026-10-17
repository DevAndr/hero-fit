"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hideProgramAction, unhideProgramAction } from "@/lib/catalog/actions";
import type { AdminProgram } from "@/lib/catalog/queries";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** Список опубликованных программ для админа. */
export function AdminProgramList({ programs }: { programs: AdminProgram[] }) {
  if (!programs.length) return <p className="text-sm text-muted-foreground">Опубликованных программ пока нет.</p>;
  return (
    <ul className="space-y-3">
      {programs.map((p) => (
        <ProgramRow key={p.id} program={p} />
      ))}
    </ul>
  );
}

function ProgramRow({ program: p }: { program: AdminProgram }) {
  const [pending, start] = useTransition();
  return (
    <li aria-label={p.name} className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold break-words">{p.name}</h2>
          <p className="text-sm text-muted-foreground">
            {p.author} · занимаются {p.participants} · опубликована {dateFormat.format(new Date(p.publishedAt))}
          </p>
        </div>
        {p.hidden ? <Badge variant="secondary">Снята</Badge> : <Badge variant="outline">В каталоге</Badge>}
      </div>
      {p.hidden && p.hiddenReason ? <p className="text-sm text-muted-foreground break-words">Причина: {p.hiddenReason}</p> : null}
      {p.hidden ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await unhideProgramAction(p.id);
              if (r.ok) toast.success("Программа возвращена в каталог");
              else toast.error(r.error);
            })
          }
        >
          Вернуть
        </Button>
      ) : (
        <HideButton id={p.id} />
      )}
    </li>
  );
}

function HideButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Снять
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Снять программу из каталога</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`hide-${id}`}>Причина</Label>
            <Textarea id={`hide-${id}`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">Автор увидит её в уведомлении и в редакторе программы. Уже идущие запуски не прерываются.</p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await hideProgramAction(id, reason);
                  if (!r.ok) return setError(r.error);
                  toast.success("Программа снята");
                  setOpen(false);
                  setReason("");
                  setError(null);
                })
              }
            >
              Снять
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
