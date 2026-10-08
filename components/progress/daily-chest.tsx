"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { openDailyChestAction } from "@/lib/progress/actions";
import chestClosed from "@/assets/icons/game/chest_closed.png";

const dismissKey = (day: string) => `hf:chest-dismissed:${day}`;

function wasDismissed(day: string) {
  try {
    return sessionStorage.getItem(dismissKey(day)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(day: string) {
  try {
    sessionStorage.setItem(dismissKey(day), "1");
  } catch {
    // приватный режим — диалог просто покажется ещё раз
  }
}

/**
 * Ежедневный сундук: пока сегодняшний не открыт — диалог открывается сам на любой странице и значок в шапке.
 * Закрыли, не открыв, — до конца сессии браузера только значок (`autoOpen = false` — всегда только значок, для e2e).
 * XP считает сервер.
 */
export function DailyChest({
  day,
  streak,
  available,
  autoOpen,
}: {
  /** Сегодняшний день «YYYY-MM-DD» в поясе пользователя. */
  day: string;
  /** Дней входа подряд, включая сегодня. */
  streak: number;
  available: boolean;
  autoOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    // sessionStorage есть только в браузере — решение после гидрации
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpen && available && !wasDismissed(day)) setOpen(true);
  }, [autoOpen, available, day]);

  if (!available && !opened) return null;

  return (
    <>
      {opened ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex size-8 shrink-0 items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Ежедневный сундук — забрать XP"
          title="Ежедневный сундук"
          data-testid="chest-button"
        >
          <Image src={chestClosed} alt="" sizes="32px" className="size-7 object-contain" />
          <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-xp ring-2 ring-background" />
        </button>
      )}

      <ChestDialog
        open={open}
        onOpenChange={(next, wasOpened) => {
          if (!next && !wasOpened) markDismissed(day);
          setOpen(next);
        }}
        title="Ежедневный сундук"
        description={`${streak > 1 ? `${streak} дн. подряд в приложении. ` : ""}Нажми на сундук, чтобы открыть`}
        openedDescription="Заходи завтра — чем дольше серия входов, тем больше награда"
        onOpen={openDailyChestAction}
        onOpened={() => setOpened(true)}
      />
    </>
  );
}
