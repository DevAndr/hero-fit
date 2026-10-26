"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inviteCandidatesAction } from "@/lib/together/actions";

type Friend = { id: string; name: string; together: number };

/** «Позвать друга»: принятые друзья с совместными тренировками; список грузится при открытии. */
export function InviteSheet({ open, onOpenChange, onInvite }: { open: boolean; onOpenChange: (v: boolean) => void; onInvite: (f: Friend) => void }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void inviteCandidatesAction().then((list) => {
      if (alive) setFriends(list);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Позвать друга</DialogTitle>
          <DialogDescription>Друг увидит, что вы в зале, и сможет тренироваться вместе — каждый свою тренировку</DialogDescription>
        </DialogHeader>
        {friends === null ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока некого позвать:{" "}
            <Link href="/friends" className="font-medium text-primary underline-offset-4 hover:underline">
              добавьте друзей
            </Link>
          </p>
        ) : (
          <ul aria-label="Друзья" className="-mx-1 min-h-0 overflow-y-auto">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg px-1 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.name}</span>
                  {f.together ? <span className="text-xs text-muted-foreground">тренировались вместе: {f.together}</span> : null}
                </span>
                <Button size="sm" disabled={pending} onClick={() => startTransition(() => onInvite(f))}>
                  Позвать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
