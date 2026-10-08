"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AnimationItem } from "lottie-web";
import { cn } from "@/lib/utils";

/**
 * Lottie-анимации из `assets/lottie`. Плеер (lottie_light — только SVG, без expressions) и сами JSON
 * грузятся динамическим import() при первом показе: отдельные чанки в /_next/static — их кэширует
 * service worker, поэтому работают и без сети.
 */
const SOURCES = {
  success: () => import("@/assets/lottie/success.json"),
  fire: () => import("@/assets/lottie/fire.json"),
  celebration: () => import("@/assets/lottie/celebration.json"),
} as const;

export type LottieName = keyof typeof SOURCES;

const loadPlayer = () => import("lottie-web/build/player/lottie_light").then((m) => m.default);

/** Прогреть плеер и анимацию заранее, чтобы первый показ не ждал сети. */
export function preloadLottie(name: LottieName) {
  void loadPlayer();
  void SOURCES[name]();
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Декоративная анимация (aria-hidden). Пока плеер грузится — `fallback`.
 * «Уменьшить движение»: стоп-кадр `stillFrame` (по умолчанию — последний), onComplete — сразу.
 */
export function LottiePlayer({
  name,
  loop = false,
  speed = 1,
  delay = 0,
  stillFrame = "last",
  onComplete,
  fallback,
  className,
  style,
}: {
  name: LottieName;
  /** true — бесконечно, число — сколько раз повторить после первого проигрывания. */
  loop?: boolean | number;
  speed?: number;
  /** Задержка старта, мс. */
  delay?: number;
  stillFrame?: "first" | "last" | number;
  onComplete?: () => void;
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    let anim: AnimationItem | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    let cancelled = false;
    const reduced = prefersReducedMotion();

    void Promise.all([loadPlayer(), SOURCES[name]()]).then(([lottie, data]) => {
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({
        container: ref.current,
        renderer: "svg",
        loop: reduced ? false : loop,
        autoplay: false,
        // lottie меняет переданный объект — каждому экземпляру своя копия
        animationData: structuredClone(data.default),
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      anim.setSpeed(speed);
      setReady(true);
      if (reduced) {
        const frame = stillFrame === "first" ? 0 : stillFrame === "last" ? anim.totalFrames - 1 : stillFrame;
        anim.goToAndStop(frame, true);
        onCompleteRef.current?.();
        return;
      }
      anim.addEventListener("complete", () => onCompleteRef.current?.());
      timer = setTimeout(() => {
        anim?.play();
        // Бесконечная анимация вне экрана не рисуется (рендер SVG каждый кадр — заметная нагрузка)
        if (loop === true && ref.current) {
          observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? anim?.play() : anim?.pause()));
          observer.observe(ref.current);
        }
      }, delay);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      anim?.destroy();
    };
  }, [name, loop, speed, delay, stillFrame]);

  return (
    <span aria-hidden data-lottie={name} className={cn("relative inline-block", className)} style={style}>
      {!ready && fallback ? <span className="absolute inset-0 flex items-center justify-center">{fallback}</span> : null}
      <span ref={ref} className="absolute inset-0 [&_svg]:block" />
    </span>
  );
}
