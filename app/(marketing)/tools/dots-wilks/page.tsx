import type { Metadata } from "next";
import Link from "next/link";
import { StrengthScoreCalculator } from "@/components/marketing/strength-score-calculator";
import { Breadcrumbs, ToolCta } from "@/components/marketing/tool-cta";
import { env } from "@/lib/env";
import { jsonLd, toolJsonLd } from "@/lib/seo";

const TITLE = "Калькулятор DOTS и Wilks онлайн — сила с поправкой на вес тела";
const DESCRIPTION =
  "Бесплатный калькулятор DOTS и Wilks: введите пол, вес тела и присед, жим, становую — получите коэффициенты и ориентировочный уровень.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["калькулятор DOTS", "калькулятор Wilks", "DOTS пауэрлифтинг", "коэффициент Вилкса", "сумма троеборья"],
  alternates: { canonical: "/tools/dots-wilks" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/dots-wilks" },
};

const CRUMBS = [
  { href: "/", label: "Hero Fit" },
  { href: "/tools/dots-wilks", label: "Калькулятор DOTS и Wilks" },
];

const FAQ = [
  {
    q: "Что такое DOTS и Wilks?",
    a: "Это коэффициенты, которые переводят сумму троеборья (присед + жим лёжа + становая) в единое число с поправкой на вес тела. Так можно сравнивать результаты людей разного веса и пола.",
  },
  {
    q: "Чем DOTS отличается от Wilks?",
    a: "Формулы считают по-разному: Wilks появился раньше и хуже работает для очень лёгких и очень тяжёлых атлетов, DOTS — более новая формула, которую сейчас используют ряд федераций и соревнований. Калькулятор показывает оба числа.",
  },
  {
    q: "Какой результат считается хорошим для моего веса?",
    a: "Ориентир по DOTS: до 200 — начинающий, 200–299 — любитель, 300–399 — продвинутый, 400–499 — мастер, от 500 — элита. Шкала ориентировочная: она не заменяет разряды и нормативы федераций.",
  },
  {
    q: "Откуда взять свой максимум, если я не делал одиночных повторов?",
    a: "Посчитайте его по рабочему подходу в калькуляторе 1ПМ и подставьте в сумму. Это оценка, а не рекорд — реальный максимум на помосте может отличаться.",
  },
];

export default function DotsWilksPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(toolJsonLd(env.APP_URL, { path: "/tools/dots-wilks", name: "Калькулятор DOTS и Wilks", description: DESCRIPTION, crumbs: CRUMBS, faq: FAQ })),
        }}
      />
      <Breadcrumbs items={CRUMBS} />
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Калькулятор DOTS и Wilks</h1>
        <p className="text-lg text-muted-foreground">
          Сравните свою силу с поправкой на вес тела: введите пол, вес и результаты в приседе, жиме лёжа и становой тяге — калькулятор посчитает DOTS и Wilks.
        </p>
      </header>

      <StrengthScoreCalculator />

      <article className="space-y-4 text-pretty [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_p]:text-muted-foreground">
        <h2>Как считаются DOTS и Wilks</h2>
        <p>
          Обе формулы делят сумму троеборья на многочлен от веса тела и умножают на масштабный множитель. Для мужчин и женщин коэффициенты разные, а вес тела
          ограничивается рабочим диапазоном формулы: слишком лёгкий или слишком тяжёлый вес считается как ближайшая граница.
        </p>
        <h2>Не знаете максимум?</h2>
        <p>
          Возьмите рабочий подход и посчитайте его в{" "}
          <Link href="/tools/1rm" className="text-primary underline underline-offset-4 hover:no-underline">
            калькуляторе 1ПМ
          </Link>
          . Hero Fit считает расчётный 1ПМ по каждому упражнению сам, после каждой тренировки.
        </p>
        <h2>Частые вопросы</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <h3 className="font-semibold">{q}</h3>
            <p className="mt-1">{a}</p>
          </div>
        ))}
      </article>

      <ToolCta text="Hero Fit считает расчётный 1ПМ по каждому упражнению, хранит рекорды и показывает, как растёт ваша сила." />
    </div>
  );
}
