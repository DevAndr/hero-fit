"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { InviteSheet } from "@/components/together/invite-sheet";
import { PartnerBar } from "@/components/together/partner-bar";
import { useTogether } from "@/components/together/use-together";
import { cancelInviteAction, cheerAction, inviteAction, leaveAction } from "@/lib/together/actions";
import { partnerEvents, type SnapshotResponse } from "@/lib/together/response";

export type TogetherInitial = { id: string; status: "INVITED" | "ACTIVE"; role: "host" | "guest"; partnerName: string; expiresAt: string | null } | null;

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  return <span className="tabular-nums">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>;
}

/** Совместная тренировка в редакторе: «Вместе» → приглашение → ожидание → полоса партнёра. */
export function TogetherControl({ workoutId, initial }: { workoutId: string; initial: TogetherInitial }) {
  const [session, setSession] = useState(initial);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Прошлый снимок партнёра — рекорд и финиш находим по его смене (время устройства партнёра ненадёжно)
  const prev = useRef<SnapshotResponse["partner"]>(null);
  const onUpdate = useCallback((r: SnapshotResponse) => {
    const name = r.partnerName;
    for (let i = 0; i < r.cheers.length; i++) toast(`${name} прислал 👊`);
    for (const e of partnerEvents(prev.current, r.partner)) {
      if (e.kind === "record") toast.success(`${name}: новый рекорд — ${e.exercise}!`);
      if (e.kind === "finished") toast(`${name} закончил тренировку`);
    }
    prev.current = r.partner;
    for (const e of r.events) if (e.kind === "left") toast(`${name} вышел из сессии`);
    if (r.status === "DECLINED") toast(`${name} не сможет сейчас`);
    if (r.status === "EXPIRED") toast("Приглашение истекло");
    if (r.status === "ENDED" || r.status === "DECLINED" || r.status === "EXPIRED") {
      prev.current = null;
      setSession(null);
    }
    else setSession((s) => (s ? { ...s, status: r.status as "INVITED" | "ACTIVE", partnerName: name } : s));
  }, []);
  const name = session?.partnerName;
  const onGone = useCallback(() => {
    if (name) toast(`${name} вышел из сессии`);
    prev.current = null;
    setSession(null);
  }, [name]);
  const { data, offline } = useTogether(session?.id ?? null, onUpdate, onGone);

  const invite = async (f: { id: string; name: string }) => {
    const res = await inviteAction(workoutId, f.id);
    if (!res.ok) return void toast.error(res.error);
    setInviteOpen(false);
    prev.current = null;
    setSession({ id: res.sessionId, status: "INVITED", role: "host", partnerName: f.name, expiresAt: res.expiresAt });
  };
  const cancel = async () => {
    if (!session) return;
    await cancelInviteAction(session.id);
    setSession(null);
  };
  const cheer = async () => {
    if (!session) return;
    const res = await cheerAction(session.id);
    if (res.ok) toast("👊 отправлен");
    else toast.error(res.error);
  };
  const leave = async () => {
    if (!session) return;
    await leaveAction(session.id);
    setSession(null);
  };

  if (session?.status === "ACTIVE") {
    return <PartnerBar name={session.partnerName} partner={data?.partner ?? null} offline={offline} onCheer={() => void cheer()} onLeave={() => void leave()} />;
  }
  if (session?.status === "INVITED" && session.role === "guest") {
    return (
      <Link href={`/together/${session.id}`} className={buttonVariants({ size: "sm" })}>
        <Users />
        {session.partnerName} зовёт тренироваться
      </Link>
    );
  }
  if (session?.status === "INVITED") {
    const until = data?.inviteExpiresAt ?? session.expiresAt;
    return (
      <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="size-4" aria-hidden />
        <span>
          Ждём {session.partnerName}… {until ? <Countdown until={until} /> : null}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void cancel()}>
          Отменить
        </Button>
      </span>
    );
  }
  return (
    <>
      <Button size="sm" variant="outline" aria-label="Вместе" onClick={() => setInviteOpen(true)}>
        <Users />
        Вместе
      </Button>
      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} onInvite={(f) => void invite(f)} />
    </>
  );
}
