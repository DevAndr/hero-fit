"use client";

import { m } from "motion/react";
import { useLive } from "@/components/marketing/v2/screens/use-live";

/** Настоящие уведомления бота (lib/notifications/service.ts, lib/plans/reminders.ts, lib/coach/comment-actions.ts). */
const MESSAGES = [
  { title: "Сегодня по плану: Ноги 💪", body: "В 18:00 · 5 упражнений", time: "17:30" },
  { title: "Отдых окончен 💪", body: "Следующий подход: Приседания со штангой", time: "18:24" },
  { title: "Комментарий тренера к «Ноги»", body: "Глубина отличная. В пятницу пробуем 102,5", time: "20:05" },
  { title: "Не потеряй streak! 🔥", body: "Серия 6 недель — нужно ещё 1 тренировка до конца воскресенья.", time: "Сб 12:00" },
];

/** Макет чата с ботом Hero Fit: сообщения появляются по очереди, внизу — кнопка Mini App. */
export function TelegramScreen() {
  const [ref, live, reduce] = useLive<HTMLDivElement>();
  return (
    <div ref={ref} className="-mx-3.5 -mt-10 -mb-5 flex flex-1 flex-col bg-muted/70 pt-9">
      <div className="flex items-center gap-2.5 border-b border-foreground/10 bg-card px-3.5 py-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary font-display text-xs font-black text-primary-foreground">HF</span>
        <span>
          <span className="block text-[13px] font-semibold">Hero Fit</span>
          <span className="block text-[10px] text-muted-foreground">бот</span>
        </span>
      </div>
      <ul className="flex flex-1 flex-col justify-end gap-2 px-3 py-3">
        {MESSAGES.map((msg, i) => (
          <m.li
            key={msg.title}
            className="max-w-[90%] overflow-hidden rounded-2xl rounded-bl-md bg-card shadow-sm"
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
            animate={live ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="px-3 pt-2 pb-1.5">
              <p className="text-[12px] font-bold">{msg.title}</p>
              <p className="text-[11px]">{msg.body}</p>
              <p className="mt-0.5 text-right text-[9px] text-muted-foreground">{msg.time}</p>
            </div>
            <div className="border-t border-foreground/10 py-1.5 text-center text-[11px] font-semibold text-primary">Открыть</div>
          </m.li>
        ))}
      </ul>
      <div className="mx-3 mb-3 rounded-xl bg-primary py-2.5 text-center text-[13px] font-semibold text-primary-foreground">Открыть Hero Fit</div>
    </div>
  );
}
