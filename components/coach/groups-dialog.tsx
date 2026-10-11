"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { ClientPicker, type PickerClient } from "@/components/coach/client-picker";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteGroupAction, saveGroupAction } from "@/lib/coach/group-actions";
import type { CoachGroupView } from "@/lib/coach/groups";

/** Правка группы: id = null — новая. */
type Editing = { id: string | null; name: string; picked: string[] };

/** «Группы» на /coach: список групп, создание, правка названия и состава, удаление. */
export function GroupsButton({ groups, clients }: { groups: CoachGroupView[]; clients: PickerClient[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<CoachGroupView | null>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Tags />
        Группы
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Группы</DialogTitle>
          </DialogHeader>
          {editing ? (
            <GroupForm key={editing.id ?? "new"} editing={editing} clients={clients} onDone={() => setEditing(null)} />
          ) : (
            <div className="space-y-3">
              {groups.length ? (
                <ul aria-label="Группы клиентов" className="divide-y divide-border/60 rounded-lg border">
                  {groups.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 p-2.5">
                      <span className="min-w-0 truncate font-semibold">
                        {g.name} <span className="font-normal text-muted-foreground tabular-nums">· {g.clientIds.length}</span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: g.id, name: g.name, picked: g.clientIds })}>
                          Изменить
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(g)}>
                          Удалить
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Групп пока нет: соберите клиентов, чтобы фильтровать список и отмечать их разом.</p>
              )}
              <Button onClick={() => setEditing({ id: null, name: "", picked: [] })}>
                <Plus />
                Создать группу
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <RemoveGroup group={removing} onClose={() => setRemoving(null)} />
    </>
  );
}

function GroupForm({ editing, clients, onDone }: { editing: Editing; clients: PickerClient[]; onDone: () => void }) {
  const [name, setName] = useState(editing.name);
  const [picked, setPicked] = useState(editing.picked);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveGroupAction>>;
      try {
        res = await saveGroupAction(editing.id, { name, clientIds: picked });
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onDone();
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="group-name">Название</Label>
        <Input id="group-name" value={name} maxLength={40} placeholder="Например, Утро пн/ср/пт" onChange={(e) => setName(e.target.value)} />
      </div>
      <ClientPicker clients={clients} picked={picked} onChange={setPicked} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </DialogFooter>
    </form>
  );
}

function RemoveGroup({ group, onClose }: { group: CoachGroupView | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      if (!group) return;
      let res: Awaited<ReturnType<typeof deleteGroupAction>>;
      try {
        res = await deleteGroupAction(group.id);
      } catch {
        toast.error("Не удалось удалить — проверьте связь");
        return;
      }
      if (!res.ok) toast.error(res.error);
      onClose();
    });
  return (
    <AlertDialog open={group !== null} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить группу «{group?.name}»?</AlertDialogTitle>
          <AlertDialogDescription>Клиенты останутся, удалится только группа.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={remove}>
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
