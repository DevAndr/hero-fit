"use client";

/**
 * Инфографика режима тренера для лендинга — декоративные «экраны» кабинета тренера (aria-hidden, смысл — в подписи карточки).
 * Анимации стартуют при попадании в экран (useSeen) и учитывают «уменьшить движение» через MotionProvider.
 */
import { m } from "motion/react";
import { ArrowDown, ArrowUp, Check, Link2, MessageSquareText, ShieldCheck } from "lucide-react";
import { CountUp, useSeen } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const SPRING = { type: "spring", stiffness: 140, damping: 18 } as const;

/** Ссылка-приглашение и экран согласия клиента. */
export function InviteFlow({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("space-y-2 text-xs", className)}>
      <m.div
        className="flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-2.5 py-2 font-mono"
        initial={{ opacity: 0, x: -12 }}
        animate={seen ? { opacity: 1, x: 0 } : undefined}
        transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
      >
        <Link2 className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">hero-fit.ru/coach/join/K7RQ…</span>
      </m.div>
      <m.div
        className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-2"
        initial={{ opacity: 0, y: 10 }}
        animate={seen ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.5, delay: 0.45, ease: EASE }}
      >
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" />
          Доступ к тренировкам
        </span>
        <m.span
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 font-semibold text-primary-foreground"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={seen ? { scale: 1, opacity: 1 } : undefined}
          transition={{ ...SPRING, delay: 0.85 }}
        >
          <Check className="size-3" /> Разрешить
        </m.span>
      </m.div>
    </div>
  );
}

/** Список клиентов с метками внимания. */
export function ClientRows({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  const rows = [
    { initials: "МК", name: "Маша", when: "сегодня", tone: "bg-primary/15 text-primary" },
    { initials: "БЛ", name: "Борис", when: "3 дня назад", tone: "bg-muted text-muted-foreground" },
    { initials: "КС", name: "Катя", when: "давно не было", tone: "bg-streak/15 text-streak" },
  ];
  return (
    <ul ref={ref} aria-hidden className={cn("grid gap-1.5 text-xs", className)}>
      {rows.map((r, i) => (
        <m.li
          key={r.name}
          className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5"
          initial={{ opacity: 0, x: 16 }}
          animate={seen ? { opacity: 1, x: 0 } : undefined}
          transition={{ duration: 0.45, delay: 0.15 + i * 0.12, ease: EASE }}
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-linear-to-br from-primary to-chart-2 text-[10px] font-bold text-primary-foreground">
            {r.initials}
          </span>
          <span className="flex-1 font-medium">{r.name}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", r.tone)}>{r.when}</span>
        </m.li>
      ))}
    </ul>
  );
}

/** Неделя клиента с назначенными тренировками «от тренера». */
export function AssignedWeek({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const plan = new Set([0, 2, 4]);
  return (
    <div ref={ref} aria-hidden className={cn("grid grid-cols-7 gap-1 text-center text-[10px]", className)}>
      {days.map((d, i) => (
        <div key={d} className="space-y-1">
          <p className="text-muted-foreground">{d}</p>
          <div className="flex h-12 items-start justify-center rounded-md bg-muted/40 p-0.5">
            {plan.has(i) ? (
              <m.div
                className="w-full rounded border-l-2 border-primary bg-primary/15 py-1 font-semibold text-primary"
                initial={{ opacity: 0, y: -12 }}
                animate={seen ? { opacity: 1, y: 0 } : undefined}
                transition={{ ...SPRING, delay: 0.2 + i * 0.1 }}
              >
                Ноги
              </m.div>
            ) : null}
          </div>
        </div>
      ))}
      <m.p
        className="col-span-7 mt-1 text-left text-[10px] font-semibold tracking-wide text-primary uppercase"
        initial={{ opacity: 0 }}
        animate={seen ? { opacity: 1 } : undefined}
        transition={{ duration: 0.4, delay: 0.8 }}
      >
        от тренера · 8 недель
      </m.p>
    </div>
  );
}

/** Задание с прогрессией: 60 → 62,5 кг, рядом — разгрузка. */
export function ProgressionTicker({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("space-y-2 text-xs", className)}>
      <div className="rounded-lg border bg-card px-3 py-2">
        <p className="font-semibold">Приседания со штангой</p>
        <p className="mt-1 flex items-baseline gap-2 tabular-nums">
          <span className="text-muted-foreground">4 × 8 ·</span>
          <span className="font-display text-lg font-extrabold text-primary">
            <CountUp value={62.5} from={60} suffix=" кг" delay={0.5} />
          </span>
          <m.span
            className="flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={seen ? { opacity: 1, scale: 1 } : undefined}
            transition={{ ...SPRING, delay: 1.1 }}
          >
            <ArrowUp className="size-3" />
            +2,5
          </m.span>
        </p>
      </div>
      <m.p
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={seen ? { opacity: 1 } : undefined}
        transition={{ duration: 0.4, delay: 1.3 }}
      >
        <ArrowDown className="size-3.5 text-streak" />3 неудачи подряд — разгрузка −10 %
      </m.p>
    </div>
  );
}

/** Комментарий тренера к упражнению. */
export function CoachNote({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("space-y-2 text-xs", className)}>
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5">
        <span className="font-medium">Жим штанги лёжа</span>
        <span className="tabular-nums text-muted-foreground">70×6 · 70×6 · 70×5</span>
      </div>
      <m.div
        className="relative ml-4 rounded-xl rounded-tl-sm border border-primary/40 bg-primary/10 px-3 py-2"
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={seen ? { opacity: 1, y: 0, scale: 1 } : undefined}
        transition={{ ...SPRING, delay: 0.45 }}
      >
        <span className="flex items-center gap-1 text-[10px] font-semibold text-primary uppercase">
          <MessageSquareText className="size-3" /> Тренер
        </span>
        <p className="mt-0.5">Лопатки сведены — молодец. В пятницу пробуем 72,5.</p>
      </m.div>
    </div>
  );
}

/** Мини-карточка публичной страницы тренера. */
export function TrainerCard({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <m.div
      ref={ref}
      aria-hidden
      className={cn("rounded-xl border bg-card p-3 text-xs shadow-sm", className)}
      initial={{ opacity: 0, rotate: -2, y: 10 }}
      animate={seen ? { opacity: 1, rotate: 0, y: 0 } : undefined}
      transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-primary to-chart-2 font-display text-sm font-extrabold text-primary-foreground">
          ИТ
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold">Иван Тренер</p>
          <p className="text-[10px] text-muted-foreground">Тренер · Казань · онлайн и в зале</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {["Сила", "Для начинающих"].map((t) => (
          <span key={t} className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {t}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="tabular-nums">
          <span className="font-display text-base font-extrabold">
            <CountUp value={148} delay={0.4} />
          </span>{" "}
          <span className="text-muted-foreground">тренировок клиентов</span>
        </span>
        <span className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground">Заниматься</span>
      </div>
    </m.div>
  );
}
