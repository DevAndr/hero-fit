"use client";

/** Анимации лендинга: Motion (появление при прокрутке, графики) и NumberFlow (бегущие цифры). */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import NumberFlow, { continuous } from "@number-flow/react";
import { LazyMotion, MotionConfig, domAnimation, m, useInView } from "motion/react";

/** Лёгкая сборка Motion (domAnimation) + уважение системной настройки «уменьшить движение». */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Плавное появление снизу, когда блок впервые попадает в экран. */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" }) {
  const Tag = as === "li" ? m.li : m.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </Tag>
  );
}

/** Флаг «блок уже был в экране» — запуск анимаций графиков и счётчиков один раз. */
export function useSeen<T extends Element>(margin = "0px 0px -60px 0px") {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, margin: margin as `${number}px ${number}px ${number}px ${number}px` });
  return [ref, seen] as const;
}

/**
 * Бегущее число: с from до value, когда попадает в экран. Цифры прокручиваются разрядами (NumberFlow,
 * плагин continuous — проходит через промежуточные значения), формат — русский.
 */
export function CountUp({
  value,
  from = 0,
  format,
  prefix,
  suffix,
  className,
  delay = 0,
}: {
  value: number;
  from?: number;
  format?: ComponentProps<typeof NumberFlow>["format"];
  prefix?: string;
  suffix?: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (!seen) return;
    // Отложенный старт — для «лесенки» из нескольких счётчиков
    const timer = setTimeout(() => setShown(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [seen, value, delay]);
  return (
    <span ref={ref} className={className}>
      <NumberFlow
        value={shown}
        locales="ru-RU"
        format={format}
        prefix={prefix}
        suffix={suffix}
        plugins={[continuous]}
        spinTiming={{ duration: 1400, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }}
      />
    </span>
  );
}
