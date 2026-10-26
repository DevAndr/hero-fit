import Link from "next/link";
import { Download, Globe, MonitorSmartphone, Send, Smartphone } from "lucide-react";
import { Section, glass } from "@/components/marketing/v2/section";
import { buttonVariants } from "@/components/ui/button";
import { APK_MIN_ANDROID, APK_URL } from "@/lib/native/apk";
import { cn } from "@/lib/utils";

const card = cn(glass, "flex flex-col gap-4 p-6");

/** «Где тренироваться с Hero Fit»: сайт всегда, Android и Telegram — когда открыты всем. Сетка — по числу карточек. */
export function Platforms({ android, telegramUrl }: { android: boolean; telegramUrl: string | null }) {
  const count = 1 + Number(android) + Number(Boolean(telegramUrl));
  return (
    <Section id="platforms" eyebrow={<><MonitorSmartphone className="size-3.5" /> Платформы</>} title="Где тренироваться с Hero Fit" center>
      <ul className={cn("grid gap-4", count === 3 ? "md:grid-cols-3" : count === 2 ? "mx-auto max-w-4xl md:grid-cols-2" : "mx-auto max-w-md")}>
        <li className={card}>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Globe className="size-6" aria-hidden />
          </span>
          <h3 className="text-xl font-bold">Сайт</h3>
          <p className="flex-1 text-sm text-muted-foreground">
            Открывается в браузере на любом телефоне и компьютере, ставится на главный экран как приложение и работает без сети.
          </p>
          <Link href="/register" className={buttonVariants({ size: "lg" })}>
            Начать в браузере
          </Link>
        </li>
        {android ? (
          <li className={card}>
            <section aria-labelledby="android-title" id="android" className="flex flex-1 scroll-mt-24 flex-col gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <h3 id="android-title" className="text-xl font-bold">
                Приложение для Android
              </h3>
              <p className="flex-1 text-sm text-muted-foreground">
                Таймер отдыха, серия и ачивки приходят уведомлением, даже когда приложение закрыто. Без сервисов Google — через бесплатное приложение ntfy.
                Android {APK_MIN_ANDROID} и новее.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={APK_URL} download className={buttonVariants({ size: "lg" })}>
                  <Download aria-hidden /> Скачать APK
                </a>
                <Link href="/android" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  Как подключить уведомления
                </Link>
              </div>
            </section>
          </li>
        ) : null}
        {telegramUrl ? (
          <li className={card}>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Send className="size-6" aria-hidden />
            </span>
            <h3 className="text-xl font-bold">Telegram</h3>
            <p className="flex-1 text-sm text-muted-foreground">Hero Fit прямо в мессенджере — без пароля и установки, а напоминания приходят от бота.</p>
            <a href={telegramUrl} className={buttonVariants({ size: "lg", variant: "outline" })}>
              <Send aria-hidden /> Открыть в Telegram
            </a>
          </li>
        ) : null}
      </ul>
    </Section>
  );
}
