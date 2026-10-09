"use client";

import Image from "next/image";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { bossImage } from "@/components/boss/boss-sprite";
import { cn } from "@/lib/utils";

const TILT_X = 12;
const TILT_Y = 16;
const ZOOM = 2.2;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Картинка босса крупно: наклон за курсором мыши с бликом (без «уменьшить движение»),
 * клик/Enter — лупа ×2,2, которая ведётся курсором или пальцем. Стили пишутся прямо в DOM — без ре-рендеров.
 */
export function BossViewer({ code }: { code: string }) {
  const image = bossImage(code);
  const card = useRef<HTMLButtonElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);

  if (!image) return null;

  const point = (e: { clientX: number; clientY: number }) => {
    const r = card.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const move = (e: PointerEvent) => {
    const { x, y } = point(e);
    if (zoomed) {
      picture.current!.style.transformOrigin = `${x * 100}% ${y * 100}%`;
      return;
    }
    if (e.pointerType !== "mouse" || reducedMotion()) return;
    const el = card.current!;
    el.style.transition = "transform 80ms linear";
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * TILT_X}deg) rotateY(${(x - 0.5) * TILT_Y}deg) scale(1.03)`;
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
    el.dataset.tilt = "";
  };

  const reset = () => {
    const el = card.current!;
    el.style.transition = "transform 400ms ease-out";
    el.style.transform = "";
    delete el.dataset.tilt;
  };

  const toggle = (e: MouseEvent) => {
    reset();
    // С клавиатуры (detail = 0) лупа — по центру.
    const origin = e.detail === 0 ? { x: 0.5, y: 0.5 } : point(e);
    picture.current!.style.transformOrigin = `${origin.x * 100}% ${origin.y * 100}%`;
    setZoomed((z) => !z);
  };

  return (
    <button
      ref={card}
      type="button"
      onPointerMove={move}
      onPointerLeave={reset}
      onClick={toggle}
      aria-label={zoomed ? "Уменьшить картинку" : "Рассмотреть поближе"}
      aria-pressed={zoomed}
      data-testid="boss-viewer"
      className={cn(
        "group relative block w-full overflow-hidden rounded-xl bg-muted/40 outline-none will-change-transform focus-visible:ring-3 focus-visible:ring-ring/50",
        zoomed ? "cursor-zoom-out touch-none" : "cursor-zoom-in",
      )}
    >
      <div
        ref={picture}
        className="transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: zoomed ? `scale(${ZOOM})` : undefined }}
      >
        <Image src={image} alt="" sizes="(min-width: 640px) 32rem, 100vw" className="h-auto w-full" priority />
      </div>
      {/* Блик за курсором — только пока карточка наклонена. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-data-tilt:opacity-100"
        style={{ background: "radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgb(255 255 255 / 0.22), transparent 55%)" }}
      />
    </button>
  );
}
