import type { Metadata } from "next";
import Link from "next/link";
import { PlateCalculator } from "@/components/marketing/plate-calculator";
import { Breadcrumbs, ToolCta } from "@/components/marketing/tool-cta";
import { env } from "@/lib/env";
import { jsonLd, toolJsonLd } from "@/lib/seo";

const TITLE = "Калькулятор блинов для штанги и разминки — онлайн";
const DESCRIPTION =
  "Сколько блинов вешать на штангу: введите нужный вес и гриф (20, 15 или 10 кг) — калькулятор покажет блины на каждую сторону и разминочные подходы.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["калькулятор блинов", "сколько блинов вешать на штангу", "калькулятор штанги", "разминочные подходы", "вес грифа"],
  alternates: { canonical: "/tools/plates" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/plates" },
};

const CRUMBS = [
  { href: "/", label: "Hero Fit" },
  { href: "/tools/plates", label: "Калькулятор блинов" },
];

const FAQ = [
  {
    q: "Сколько весит гриф штанги?",
    a: "Стандартный олимпийский мужской гриф — 20 кг, женский — 15 кг. Короткие и EZ-грифы обычно весят 7–10 кг; выберите свой вариант в калькуляторе.",
  },
  {
    q: "Как калькулятор подбирает блины?",
    a: "От тяжёлых к лёгким из стандартного набора 25, 20, 15, 10, 5, 2,5 и 1,25 кг — так на гриф уходит меньше всего блинов. Если ровно нужный вес не собрать, калькулятор покажет ближайший.",
  },
  {
    q: "Как делать разминку перед рабочим весом?",
    a: "Классическая схема: пустой гриф на 10 повторений, затем примерно 40 % рабочего веса на 5, 60 % на 3 и 80 % на 2 повторения. Для весов меньше 40 кг отдельная разминка подходами обычно не нужна.",
  },
];

export default function PlatesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            toolJsonLd(env.APP_URL, { path: "/tools/plates", name: "Калькулятор блинов и разминки", description: DESCRIPTION, crumbs: CRUMBS, faq: FAQ }),
          ),
        }}
      />
      <Breadcrumbs items={CRUMBS} />
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Калькулятор блинов и разминки</h1>
        <p className="text-lg text-muted-foreground">
          Не считайте в уме между подходами: введите вес на штанге — и сразу увидите, какие блины повесить на каждую сторону и как размяться перед рабочим подходом.
        </p>
      </header>

      <PlateCalculator />

      <article className="space-y-4 text-pretty [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_p]:text-muted-foreground">
        <h2>Частые вопросы</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <h3 className="font-semibold">{q}</h3>
            <p className="mt-1">{a}</p>
          </div>
        ))}
      </article>

      <p className="text-sm text-muted-foreground">
        Смотрите также:{" "}
        <Link href="/tools/1rm" className="text-primary underline underline-offset-4 hover:no-underline">
          калькулятор 1ПМ
        </Link>
        ,{" "}
        <Link href="/tools/dots-wilks" className="text-primary underline underline-offset-4 hover:no-underline">
          DOTS и Wilks
        </Link>{" "}
        и{" "}
        <Link href="/training-programs" className="text-primary underline underline-offset-4 hover:no-underline">
          готовые программы тренировок
        </Link>
        .
      </p>

      <ToolCta text="В Hero Fit калькулятор блинов и разминка встроены в тренировку: разминочные подходы добавляются одним касанием." />
    </div>
  );
}
