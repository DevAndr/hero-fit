import { Check, NotebookPen, X } from "lucide-react";
import { Section, glass } from "@/components/marketing/v2/section";
import { cn } from "@/lib/utils";

const ROWS: [feature: string, notebook: boolean][] = [
  ["Запись подходов, веса и повторов", true],
  ["Личные рекорды и 1ПМ считаются сами", false],
  ["Подсказка «пора увеличить вес»", false],
  ["Таймер отдыха с уведомлением", false],
  ["Графики прогресса по каждому упражнению", false],
  ["Мотивация: уровни, ачивки, серия, лига", false],
  ["Босс недели, сундуки и титулы", false],
  ["Восстановление мышц и баланс нагрузки", false],
  ["Напоминания о тренировках по плану", false],
  ["Тренировки с тренером: план, программы и комментарии", false],
];

/** «Чем Hero Fit лучше блокнота» — таблица. Сравнение только с блокнотом: про чужие приложения не утверждаем. */
export function Compare() {
  return (
    <Section id="compare" eyebrow={<><NotebookPen className="size-3.5" /> Почему не блокнот</>} title="Чем Hero Fit лучше блокнота" center>
      <div className={cn(glass, "mx-auto max-w-3xl overflow-hidden")}>
        <table className="w-full text-sm">
          <caption className="sr-only">Сравнение Hero Fit и бумажного дневника тренировок</caption>
          <thead>
            <tr className="border-b border-foreground/10 text-left">
              <th scope="col" className="p-3 font-semibold sm:p-4">
                Возможность
              </th>
              <th scope="col" className="w-20 p-3 text-center font-semibold text-muted-foreground sm:w-28 sm:p-4">
                Блокнот
              </th>
              <th scope="col" className="w-20 bg-primary/10 p-3 text-center font-semibold text-primary sm:w-28 sm:p-4">
                Hero Fit
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, notebook]) => (
              <tr key={feature} className="border-b border-foreground/10 last:border-0">
                <th scope="row" className="p-3 text-left font-normal sm:p-4">
                  {feature}
                </th>
                <td className="p-3 text-center sm:p-4">
                  {notebook ? <Check className="mx-auto size-5 text-muted-foreground" aria-label="есть" /> : <X className="mx-auto size-5 text-muted-foreground/50" aria-label="нет" />}
                </td>
                <td className="bg-primary/10 p-3 text-center sm:p-4">
                  <Check className="mx-auto size-5 text-primary" aria-label="есть" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
