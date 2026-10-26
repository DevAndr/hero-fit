"use client";

import { useEffect, useRef, useState } from "react";
import type { SnapshotResponse } from "@/lib/together/response";
import { OFFLINE_AFTER_MS, POLL_MS } from "@/lib/together/rules";

const FINAL = new Set(["ENDED", "DECLINED", "EXPIRED"]);

/**
 * Опрос совместной тренировки раз в 5 с, пока вкладка видима; на конечном статусе — стоп.
 * onUpdate получает каждый ответ (тосты 👊 и событий), onGone — сессия исчезла (404). offline — 30 с без успешного ответа.
 */
export function useTogether(sessionId: string | null, onUpdate: (r: SnapshotResponse) => void, onGone: () => void) {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const update = useRef(onUpdate);
  const gone = useRef(onGone);
  useEffect(() => {
    update.current = onUpdate;
    gone.current = onGone;
  }, [onUpdate, onGone]);

  useEffect(() => {
    if (!sessionId) return;
    let since: string | null = null;
    let lastOk = Date.now();
    let stopped = false;
    let busy = false;
    let timer: number | undefined;

    const poll = async () => {
      window.clearTimeout(timer);
      if (stopped || busy) return;
      if (document.visibilityState === "visible") {
        busy = true;
        try {
          const res = await fetch(`/api/together/${sessionId}${since ? `?since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as SnapshotResponse;
            if (stopped) return;
            since = body.now;
            lastOk = Date.now();
            setOffline(false);
            setData(body);
            update.current(body);
            if (FINAL.has(body.status)) return;
          } else if (res.status === 404) {
            // Сессии больше нет (партнёр удалил аккаунт — каскад) — полоса не должна застыть
            stopped = true;
            gone.current();
            return;
          }
        } catch {
          // нет сети — следующая попытка через POLL_MS
        } finally {
          busy = false;
        }
        if (Date.now() - lastOk >= OFFLINE_AFTER_MS) setOffline(true);
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId]);

  return { data: sessionId ? data : null, offline };
}
