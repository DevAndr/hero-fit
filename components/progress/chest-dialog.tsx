"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prefersReducedMotion } from "@/components/lottie/lottie-player";
import { cn } from "@/lib/utils";
import chestClosed from "@/assets/icons/game/chest_closed.png";
import chestOpened from "@/assets/icons/game/chest_opened.png";

export type ChestOpenResult = { ok: true; amount: number; rare?: boolean } | { ok: false; error: string };
type Opened = Extract<ChestOpenResult, { ok: true }>;

/**
 * Диалог открытия сундука (ежедневного, босса): клик по сундуку → `onOpen` (сервер считает XP) →
 * сундук открывается, вылетает «+N XP». Ошибка — тост и закрытие.
 */
export function ChestDialog({
  open,
  onOpenChange,
  title,
  description,
  openedDescription,
  onOpen,
  onOpened,
}: {
  open: boolean;
  /** `opened` — сундук уже открыт в этом диалоге. */
  onOpenChange: (open: boolean, opened: boolean) => void;
  title: string;
  description: string;
  openedDescription: string;
  onOpen: () => Promise<ChestOpenResult>;
  onOpened?: () => void;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [pending, startTransition] = useTransition();
  const chestRef = useRef<HTMLButtonElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rewardRef = useRef<HTMLParagraphElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

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
      const result = await onOpen().catch(() => ({ ok: false as const, error: "Не удалось открыть сундук" }));
      shake?.cancel();
      if (result.ok) {
        setOpened(result);
        onOpened?.();
      } else {
        toast.error(result.error);
        onOpenChange(false, false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next, !!opened)}>
      <DialogContent className="sm:max-w-sm" initialFocus={actionRef} data-testid="chest-dialog">
        <DialogHeader className="items-center text-center">
          <DialogTitle>{opened ? (opened.rare ? "Редкий сундук!" : "Награда получена") : title}</DialogTitle>
          <DialogDescription>{opened ? openedDescription : description}</DialogDescription>
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
            className="relative flex h-full w-full origin-bottom items-end justify-center outline-none focus-visible:brightness-110 enabled:cursor-pointer"
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
            <Button ref={actionRef} className="w-full bg-amber-400 hover:bg-amber-300" onClick={() => onOpenChange(false, true)}>
              Забрать
            </Button>
          ) : (
            <Button ref={actionRef} className="w-full bg-amber-400 hover:bg-amber-300" onClick={openChest} disabled={pending}>
              {pending ? "Открываем…" : "Открыть"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
