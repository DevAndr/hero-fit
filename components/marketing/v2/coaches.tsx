import Link from "next/link";
import { ArrowRight, Briefcase, CalendarRange, MessageSquareText, Store, UsersRound } from "lucide-react";
import { Reveal } from "@/components/marketing/motion";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { ClientsScreen } from "@/components/marketing/v2/screens/clients-screen";
import { Section, glass } from "@/components/marketing/v2/section";
import { buttonVariants } from "@/components/ui/button";

/** Утверждения держать в соответствии с режимом тренера (docs/features/coach.md). */
const POINTS = [
  {
    icon: UsersRound,
    title: "Клиенты и сигналы",
    text: "Кто пропадает, у кого застой, кому пора добавить вес — видно сразу. По каждому — тренировки, статистика и карта мышц.",
  },
  {
    icon: CalendarRange,
    title: "Планы и программы на недели",
    text: "Шаблоны в календарь клиента и циклы на 2–16 недель: веса растут сами, разгрузка — по расписанию.",
  },
  {
    icon: MessageSquareText,
    title: "Комментарии к тренировкам",
    text: "Отзыв и заметки к упражнениям прямо в сводке — клиенту приходит уведомление.",
  },
  {
    icon: Store,
    title: "Публичная страница и каталог тренеров",
    text: "Своя страница с честными цифрами из приложения, а в каталоге клиенты найдут вас по городу и специализации.",
  },
];

/** «Тренерам»: телефон с клиентами, четыре главные возможности и кнопки. */
export function Coaches({ showFind }: { showFind: boolean }) {
  return (
    <Section
      id="coaches"
      eyebrow={<><Briefcase className="size-3.5" /> Тренерам</>}
      title="Ведите клиентов там, где им интересно тренироваться"
      lead="Клиент качается в игровом дневнике — уровни, серия, босс недели. А вы видите каждую тренировку, назначаете план и ведёте прогрессию. Без таблиц и переписки."
      className="overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 -z-10 size-144 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_65%)]"
      />
      <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr]">
        <PhoneFrame label="Экран тренера: клиенты и сигналы" tilt="left" className="lg:order-none">
          <ClientsScreen />
        </PhoneFrame>
        <div className="space-y-8">
          <ul className="grid gap-4 sm:grid-cols-2">
            {POINTS.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={(i % 2) * 0.08} className={`${glass} p-5`}>
                <Icon aria-hidden className="size-5 text-primary" />
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </Reveal>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/register?coach=1" className={buttonVariants({ size: "lg" })}>
              Стать тренером — бесплатно <ArrowRight aria-hidden />
            </Link>
            {showFind ? (
              <Link href="/trainers" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Найти тренера
              </Link>
            ) : null}
            <span className="text-sm text-muted-foreground">Пока идёт бета — всё бесплатно</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
