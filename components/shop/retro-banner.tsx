"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { coinWord } from "@/lib/shop/labels";

const KEY = "hf:shop-retro-seen";

/** Плашка «за прошлые тренировки начислено N монет» — один раз на устройстве (после закрытия не возвращается). */
export function RetroBanner({ amount }: { amount: number }) {
  const [closed, setClosed] = useState(false);
  // На сервере и при гидратации — «уже видели» (плашки нет), на клиенте читаем localStorage
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  if (seen || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
      <p className="flex-1">
        За прошлые тренировки начислено <b className="tabular-nums">{amount}</b> {coinWord(amount)}
      </p>
      <Button size="icon-sm" variant="ghost" aria-label="Закрыть" onClick={close}>
        <X />
      </Button>
    </div>
  );
}

const subscribe = () => () => {};

function readSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
