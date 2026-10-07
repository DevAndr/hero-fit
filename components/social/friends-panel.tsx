"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Share2, UserMinus, UserPlus, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { removeFriendshipAction, respondFriendRequestAction, sendFriendRequestAction } from "@/lib/social/actions";

type Person = { id: string; nickname: string; level: number };

/** Код в группах по 4 — легче продиктовать. */
const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

function inviteUrl(code: string) {
  return `${window.location.origin}/leaderboard?invite=${code}`;
}

export function InviteCard({ code }: { code: string }) {
  const share = async () => {
    const url = inviteUrl(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Hero Fit — недельная лига", text: "Соревнуйся со мной в Hero Fit!", url });
        return;
      } catch {
        // отмена шаринга — просто копируем
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Ссылка-приглашение скопирована");
  };

  return (
    <section aria-label="Пригласить друга" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Пригласить друга</h2>
      <p className="text-sm text-muted-foreground">Отправьте ссылку или продиктуйте код — друг добавит вас в лигу.</p>
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <span className="font-mono text-lg font-bold tracking-widest" data-testid="friend-code">
          {pretty(code)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Скопировать код"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            toast.success("Код скопирован");
          }}
        >
          <Copy />
        </Button>
      </div>
      <Button variant="outline" className="w-full" onClick={share}>
        <Share2 />
        Поделиться ссылкой
      </Button>
    </section>
  );
}

export function AddFriendForm() {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label="Добавить по коду"
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await sendFriendRequestAction(code);
          if (result.ok) {
            setCode("");
            toast.success(result.message ?? "Готово");
          } else toast.error(result.error);
        });
      }}
    >
      <Input
        aria-label="Код друга"
        placeholder="Код друга"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
        maxLength={12}
      />
      <Button type="submit" disabled={pending || !code.trim()}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Добавить
      </Button>
    </form>
  );
}

function PersonRow({ person, children }: { person: Person; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary uppercase"
      >
        {person.nickname.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{person.nickname}</span>
      <span className="text-xs text-muted-foreground tabular-nums">LVL {person.level}</span>
      <span className="flex gap-1">{children}</span>
    </li>
  );
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      // Сообщение сервера точнее: встречная заявка сразу превращается в дружбу.
      if (result.ok) toast.success(result.message ?? success);
      else toast.error(result.error ?? "Не получилось");
    });
  return { pending, run };
}

function RemoveFriendButton({ person }: { person: Person }) {
  const { pending, run } = useAction();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Удалить ${person.nickname} из друзей`}
            className="text-muted-foreground"
          />
        }
      >
        <UserMinus />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить {person.nickname} из друзей?</AlertDialogTitle>
          <AlertDialogDescription>Вы перестанете видеть друг друга в недельной лиге.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => run(() => removeFriendshipAction(person.id), `${person.nickname} удалён из друзей`)}
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FriendsPanel({ friends, incoming, outgoing }: { friends: Person[]; incoming: Person[]; outgoing: Person[] }) {
  const { pending, run } = useAction();

  return (
    <section aria-label="Друзья" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Друзья</h2>
      <AddFriendForm />

      {incoming.length ? (
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Заявки ({incoming.length})</h3>
          <ul aria-label="Входящие заявки" className="divide-y divide-border/50">
            {incoming.map((p) => (
              <PersonRow key={p.id} person={p}>
                <Button
                  size="icon-sm"
                  aria-label={`Принять заявку от ${p.nickname}`}
                  disabled={pending}
                  onClick={() => run(() => respondFriendRequestAction(p.id, true), `${p.nickname} теперь в друзьях`)}
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Отклонить заявку от ${p.nickname}`}
                  disabled={pending}
                  onClick={() => run(() => respondFriendRequestAction(p.id, false), "Заявка отклонена")}
                >
                  <X />
                </Button>
              </PersonRow>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">В лиге ({friends.length})</h3>
        {friends.length ? (
          <ul aria-label="Список друзей" className="divide-y divide-border/50">
            {friends.map((p) => (
              <PersonRow key={p.id} person={p}>
                <RemoveFriendButton person={p} />
              </PersonRow>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Пока никого — пригласите друга по коду или ссылке.</p>
        )}
      </div>

      {outgoing.length ? (
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ждут ответа</h3>
          <ul aria-label="Отправленные заявки" className="divide-y divide-border/50">
            {outgoing.map((p) => (
              <PersonRow key={p.id} person={p}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => removeFriendshipAction(p.id), "Заявка отменена")}
                >
                  Отменить
                </Button>
              </PersonRow>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Баннер по ссылке-приглашению ?invite=CODE. */
export function InviteBanner({ code, nickname, level }: { code: string; nickname: string; level: number }) {
  const { pending, run } = useAction();
  return (
    <section
      aria-label="Приглашение"
      className="card-glow flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
    >
      <p>
        <span className="font-bold">{nickname}</span> <span className="text-muted-foreground">(LVL {level})</span> зовёт вас
        в недельную лигу
      </p>
      <Button disabled={pending} onClick={() => run(() => sendFriendRequestAction(code), `Заявка отправлена: ${nickname}`)}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Добавить в друзья
      </Button>
    </section>
  );
}
