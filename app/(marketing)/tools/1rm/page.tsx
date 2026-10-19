import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, ToolCta } from "@/components/marketing/tool-cta";
import { OneRmCalculator } from "@/components/stats/one-rm-calculator";
import { env } from "@/lib/env";
import { jsonLd, toolJsonLd } from "@/lib/seo";

const TITLE = "Калькулятор 1ПМ онлайн — одноповторный максимум по формуле Эпли";
const DESCRIPTION =
  "Бесплатный калькулятор 1ПМ: введите вес и число повторений — получите расчётный одноповторный максимум и таблицу рабочих весов на 1–12 повторений.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["калькулятор 1ПМ", "одноповторный максимум", "калькулятор максимума жима", "формула Эпли", "1RM калькулятор"],
  alternates: { canonical: "/tools/1rm" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/1rm" },
};

const CRUMBS = [
  { href: "/", label: "Hero Fit" },
  { href: "/tools/1rm", label: "Калькулятор 1ПМ" },
];

const FAQ = [
  {
    q: "Что такое 1ПМ?",
    a: "1ПМ (1RM) — одноповторный максимум: самый большой вес, который вы можете поднять в упражнении один раз с правильной техникой.",
  },
  {
    q: "Насколько точна формула Эпли?",
    a: "Точнее всего она работает для 2–10 повторений. Чем больше повторов, тем выше погрешность — для оценки максимума берите подход на 3–6 повторений, выполненный почти до отказа.",
  },
  {
    q: "Зачем знать свой 1ПМ, если не выступаешь в пауэрлифтинге?",
    a: "Проценты от 1ПМ помогают подобрать рабочий вес: например, 75–85 % для силы и 65–75 % для гипертрофии. А рост расчётного 1ПМ — честная мера прогресса.",
  },
];

export default function OneRmPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(toolJsonLd(env.APP_URL, { path: "/tools/1rm", name: "Калькулятор 1ПМ", description: DESCRIPTION, crumbs: CRUMBS, faq: FAQ })),
        }}
      />
      <Breadcrumbs items={CRUMBS} />
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Калькулятор 1ПМ</h1>
        <p className="text-lg text-muted-foreground">
          Узнайте свой одноповторный максимум без риска травмы: введите вес и сколько раз вы его подняли. Калькулятор посчитает 1ПМ по формуле Эпли и подскажет вес
          на любое число повторений.
        </p>
      </header>

      <OneRmCalculator initialWeight="100" initialReps="5" />

      <article className="space-y-4 text-pretty [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_p]:text-muted-foreground">
        <h2>Как считается одноповторный максимум</h2>
        <p>
          Формула Эпли: <strong className="text-foreground">1ПМ = вес × (1 + повторы / 30)</strong>. Например, жим 100 кг на 5 повторений даёт расчётный максимум
          около 116,7 кг. Для одного повторения 1ПМ равен самому весу.
        </p>
        <h2>Как пользоваться таблицей</h2>
        <p>
          Таблица под результатом показывает, какой вес вы сможете поднять на нужное число повторений, и сколько это процентов от максимума. Планируете 8 повторений —
          берите строку «8».
        </p>
        <h2>Частые вопросы</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <h3 className="font-semibold">{q}</h3>
            <p className="mt-1">{a}</p>
          </div>
        ))}
      </article>

      <p className="text-sm text-muted-foreground">
        Знаете максимум в приседе, жиме и тяге?{" "}
        <Link href="/tools/dots-wilks" className="text-primary underline underline-offset-4 hover:no-underline">
          Посчитайте DOTS и Wilks
        </Link>
        .
      </p>

      <ToolCta text="В Hero Fit расчётный 1ПМ, рекорды по весу и повторам считаются после каждой тренировки, а график показывает, как растёт сила." />
    </div>
  );
}
