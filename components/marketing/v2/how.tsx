import { ClipboardList, Dumbbell, Flame, Play, Sparkles, Trophy } from "lucide-react";
import { Reveal } from "@/components/marketing/motion";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { WorkoutScreen } from "@/components/marketing/v2/screens/workout-screen";
import { Section, glass } from "@/components/marketing/v2/section";

/** Мини-экран шага 1: старт тренировки. */
function StartMini() {
  return (
    <div aria-hidden className="space-y-2 text-sm">
      {[
        ["По плану: Ноги · 18:00", true],
        ["Шаблон «Грудь и трицепс»", false],
        ["Программа 5×5 · неделя 3", false],
      ].map(([t, main]) => (
        <div key={String(t)} className={main ? "flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 font-semibold text-primary-foreground" : "flex items-center gap-2 rounded-xl border bg-background/60 px-3 py-2.5"}>
          {main ? <Play className="size-4" /> : <ClipboardList className="size-4 text-muted-foreground" />} {t}
        </div>
      ))}
    </div>
  );
}

/** Мини-экран шага 3: сводка. */
function SummaryMini() {
  return (
    <div aria-hidden className="space-y-2 text-sm">
      <div className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-xp" /> Опыт
        </span>
        <b className="text-xp tabular-nums">+164 XP</b>
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Trophy className="size-4 text-xp" /> Рекорды
        </span>
        <b className="tabular-nums">2</b>
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Flame className="size-4 text-streak" /> Серия
        </span>
        <b>6 недель</b>
      </div>
    </div>
  );
}

const STEPS = [
  { n: "01", title: "Собери тренировку", text: "Готовая программа, свой шаблон или повтор прошлой — в одно касание. Или набери упражнения сам.", visual: <StartMini /> },
  { n: "02", title: "Отмечай подходы", text: "Вес и повторы подставятся с прошлого раза, таймер отдыха запустится сам и позовёт к следующему подходу.", visual: null },
  { n: "03", title: "Получи XP и рекорды", text: "Сводка покажет опыт, побитые рекорды и ачивки. Три тренировки в неделю — и серия растёт.", visual: <SummaryMini /> },
];

/** «Как это работает»: три шага; средний — живой телефон с тренировкой. */
export function How() {
  return (
    <Section id="how" eyebrow={<><Dumbbell className="size-3.5" /> Как это работает</>} title="Три шага до нового уровня" center>
      <ol className="grid items-center gap-6 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 0.1} className={i === 1 ? "lg:order-none" : ""}>
            {s.visual ? (
              <div className={`${glass} p-6`}>
                <span aria-hidden className="font-display text-5xl font-black text-primary/25">
                  {s.n}
                </span>
                <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.text}</p>
                <div className="mt-5">{s.visual}</div>
              </div>
            ) : (
              <div className="space-y-5 text-center">
                <PhoneFrame label="Экран тренировки: подходы и таймер отдыха">
                  <WorkoutScreen />
                </PhoneFrame>
                <div>
                  <span aria-hidden className="font-display text-5xl font-black text-primary/25">
                    {s.n}
                  </span>
                  <h3 className="mt-1 text-xl font-bold">{s.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-muted-foreground">{s.text}</p>
                </div>
              </div>
            )}
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
