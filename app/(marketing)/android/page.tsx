import type { Metadata } from "next";
import { CopyAddress } from "@/components/native/copy-address";
import { env } from "@/lib/env";
import { NTFY_STORES } from "@/lib/native/ntfy-stores";

// Инструкция для Android-приложения (спека 2026-10-25-native-push-ntfy). В индекс — когда приложение будет в магазинах.
export const metadata: Metadata = {
  title: "Уведомления в приложении для Android",
  description: "Как включить уведомления Hero Fit на Android: приложение ntfy, наш сервер и разрешение на уведомления.",
  alternates: { canonical: "/android" },
  robots: { index: false, follow: false },
};

// Адрес ntfy — из env на сервере, а не на сборке образа
export const dynamic = "force-dynamic";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {children}
      </div>
    </li>
  );
}

export default function AndroidPage() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12 text-pretty sm:py-16 [&_p]:text-muted-foreground">
      <header className="space-y-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight hyphens-auto sm:text-4xl">Уведомления в приложении Hero Fit для Android</h1>
        <p>
          Таймер отдыха, серия, ачивки и напоминания приходят, даже когда Hero Fit закрыт и экран заблокирован. Мы не используем сервисы Google:
          уведомления доставляет бесплатное приложение ntfy через наш сервер, а содержимое зашифровано ключом вашего телефона — сервер его не видит.
        </p>
      </header>

      <ol className="space-y-8">
        <Step n={1} title="Установите ntfy">
          <p>Бесплатное приложение с открытым кодом. Одно на все приложения — батарея почти не тратится.</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {NTFY_STORES.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                ntfy в {s.name}
              </a>
            ))}
          </p>
        </Step>
        <Step n={2} title="Укажите наш сервер в ntfy">
          <p>Откройте ntfy → Настройки → «Сервер по умолчанию» и вставьте адрес:</p>
          {env.NTFY_URL ? <CopyAddress value={env.NTFY_URL} /> : <p>Сервер уведомлений пока не настроен.</p>}
          <p>С другим сервером (например, ntfy.sh) уведомления Hero Fit не придут.</p>
        </Step>
        <Step n={3} title="Включите уведомления в Hero Fit">
          <p>Hero Fit → Настройки → «Push на этом устройстве» → «Включить push» и разрешите уведомления, когда Android спросит.</p>
        </Step>
        <Step n={4} title="Проверьте">
          <p>Там же нажмите «Отправить тестовое» — уведомление придёт через пару секунд.</p>
        </Step>
      </ol>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">Не приходят?</h2>
        <ul className="space-y-1.5 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">
          <li>Уведомления Hero Fit выключены в настройках Android: Настройки → Приложения → Hero Fit → Уведомления.</li>
          <li>В ntfy выбран другой сервер. Поменяйте его на адрес выше, затем в Hero Fit выключите и снова включите push.</li>
          <li>
            Телефон усыпляет ntfy ради экономии батареи (особенно Samsung и Xiaomi): Настройки → Приложения → ntfy → Батарея → «Без ограничений».
          </li>
          <li>Приложение ntfy удалили — установите его снова и включите push в Hero Fit.</li>
        </ul>
      </section>
    </article>
  );
}
