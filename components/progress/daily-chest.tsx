"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prefersReducedMotion } from "@/components/lottie/lottie-player";
import { openDailyChestAction, type OpenChestResult } from "@/lib/progress/actions";
import { cn } from "@/lib/utils";
import chestClosed from "@/assets/icons/game/chest_closed.png";
import chestOpened from "@/assets/icons/game/chest_opened.png";

type Opened = Extract<OpenChestResult, { ok: true }>;

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
 * Ежедневный сундук: пока сегодняшний не открыт — значок в шапке, на дашборде диалог открывается сам
 * (раз за сессию браузера; `autoOpen = false` — только по значку, для e2e). XP считает сервер.
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [pending, startTransition] = useTransition();
  const chestRef = useRef<HTMLButtonElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rewardRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // sessionStorage есть только в браузере — решение после гидрации
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpen && available && pathname === "/dashboard" && !wasDismissed(day)) setOpen(true);
  }, [autoOpen, available, pathname, day]);

  // Покачивание закрытого сундука — конечное, чтобы не грузить страницу бесконечной анимацией
  useEffect(() => {
    if (!open || opened || prefersReducedMotion()) return;
    const anim = chestRef.current?.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-4deg)", offset: 0.1 },
        { transform: "rotate(4deg)", offset: 0.2 },
        { transform: "rotate(-2deg)", offset: 0.3 },
        { transform: "rotate(0deg)", offset: 0.4 },
        { transform: "rotate(0deg)" },
      ],
      { duration: 1600, iterations: 4, delay: 300 },
    );
    return () => anim?.cancel();
  }, [open, opened]);

  // Открытие: сундук подпрыгивает, за ним вспышка, вверх вылетает «+N XP»
  useEffect(() => {
    if (!opened || prefersReducedMotion()) return;
    const anims = [
      chestRef.current?.animate(
        [{ transform: "scale(0.85)" }, { transform: "scale(1.08)", offset: 0.6 }, { transform: "scale(1)" }],
        { duration: 450, easing: "cubic-bezier(0.22, 0.8, 0.25, 1)" },
      ),
      glowRef.current?.animate([{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1)" }], {
        duration: 600,
        fill: "both",
      }),
      rewardRef.current?.animate(
        [
          { opacity: 0, transform: "translateY(40px) scale(0.6)" },
          { opacity: 1, transform: "translateY(-6px) scale(1.15)", offset: 0.7 },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 700, delay: 150, easing: "ease-out", fill: "both" },
      ),
    ];
    return () => anims.forEach((a) => a?.cancel());
  }, [opened]);

  if (!available && !opened) return null;

  const openChest = () => {
    if (pending || opened) return;
    const shake = prefersReducedMotion()
      ? undefined
      : chestRef.current?.animate(
          [
            { transform: "translateX(0) rotate(0)" },
            { transform: "translateX(-5px) rotate(-5deg)" },
            { transform: "translateX(5px) rotate(5deg)" },
            { transform: "translateX(0) rotate(0)" },
          ],
          { duration: 160, iterations: Infinity },
        );
    startTransition(async () => {
      const result = await openDailyChestAction().catch(() => ({ ok: false as const, error: "Не удалось открыть сундук" }));
      shake?.cancel();
      if (result.ok) {
        setOpened(result);
      } else {
        toast.error(result.error);
        setOpen(false);
      }
    });
  };

  const onOpenChange = (next: boolean) => {
    if (!next && !opened) markDismissed(day);
    setOpen(next);
  };

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

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm" data-testid="chest-dialog">
          <DialogHeader className="items-center text-center">
            <DialogTitle>{opened ? (opened.rare ? "Редкий сундук!" : "Награда получена") : "Ежедневный сундук"}</DialogTitle>
            <DialogDescription>
              {opened
                ? "Заходи завтра — чем дольше серия входов, тем больше награда"
                : `${streak > 1 ? `${streak} дн. подряд в приложении. ` : ""}Нажми на сундук, чтобы открыть`}
            </DialogDescription>
          </DialogHeader>

          <div className="relative mx-auto flex h-72 w-56 items-end justify-center pt-12">
            <div
              ref={glowRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-16 bottom-0 rounded-full blur-2xl",
                opened ? (opened.rare ? "bg-xp/45" : "bg-xp/25") : "opacity-0",
              )}
            />
            <button
              ref={chestRef}
              type="button"
              onClick={openChest}
              disabled={pending || !!opened}
              aria-label={opened ? `Сундук открыт: +${opened.amount} XP` : "Открыть сундук"}
              aria-busy={pending}
              className="relative flex h-full w-full origin-bottom items-end justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:cursor-pointer"
              data-testid="chest-open"
            >
              {/* Открытый выше закрытого (поднята крышка) — обе картинки стоят на одном «полу» */}
              <Image
                src={opened ? chestOpened : chestClosed}
                alt=""
                priority
                sizes="224px"
                className={cn("w-full object-contain object-bottom", opened ? "max-h-56" : "max-h-48")}
              />
            </button>
            {opened ? (
              <p
                ref={rewardRef}
                className="pointer-events-none absolute top-0 inset-x-0 text-center text-4xl font-black text-xp tabular-nums dark:drop-shadow-[0_2px_8px_rgb(0_0_0/0.45)]"
                data-testid="chest-reward"
              >
                +{opened.amount} XP
              </p>
            ) : null}
          </div>

          <DialogFooter>
            {opened ? (
              <Button className="w-full" onClick={() => setOpen(false)}>
                Забрать
              </Button>
            ) : (
              <Button className="w-full" onClick={openChest} disabled={pending}>
                {pending ? "Открываем…" : "Открыть"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
