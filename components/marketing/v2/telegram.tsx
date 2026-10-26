import { BellRing, KeyRound, Send, UserPlus } from "lucide-react";
import { Reveal } from "@/components/marketing/motion";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { TelegramScreen } from "@/components/marketing/v2/screens/telegram-screen";
import { Section, glass } from "@/components/marketing/v2/section";
import { buttonVariants } from "@/components/ui/button";

/** Утверждения держать в соответствии с docs/features/telegram.md. */
const POINTS = [
  {
    icon: KeyRound,
    title: "Вход без пароля",
    text: "Тот же Hero Fit прямо в Telegram: вход в одно касание. Можно сразу начать или привязать уже существующий аккаунт.",
  },
  {
    icon: BellRing,
    title: "Уведомления от бота",
    text: "Конец отдыха, тренировка по плану, комментарий тренера, «не потеряй серию» — приходят сообщением с кнопкой «Открыть».",
  },
  {
    icon: UserPlus,
    title: "Приглашение от тренера",
    text: "Ссылка тренера открывает Hero Fit в мессенджере — клиент подключается за минуту, без установки и пароля.",
  },
];

/** «Hero Fit в Telegram»: макет чата с ботом и три возможности. Только при настроенном боте. */
export function Telegram({ telegramUrl }: { telegramUrl: string }) {
  return (
    <Section
      id="telegram"
      eyebrow={<><Send className="size-3.5" /> Telegram</>}
      title="Hero Fit в Telegram"
      lead="Тренируйтесь там, где вы и так проводите время: приложение открывается прямо в мессенджере, а напоминания приходят от бота."
      className="overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_25%_50%,color-mix(in_oklch,var(--chart-2)_14%,transparent),transparent_60%)]"
      />
      <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr]">
        <PhoneFrame label="Чат с ботом Hero Fit в Telegram" tilt="left">
          <TelegramScreen />
        </PhoneFrame>
        <div className="space-y-6">
          <ul className="grid gap-4">
            {POINTS.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 0.08} className={`${glass} flex gap-4 p-5`}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
          <a href={telegramUrl} className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })}>
            <Send aria-hidden /> Открыть в Telegram
          </a>
        </div>
      </div>
    </Section>
  );
}
