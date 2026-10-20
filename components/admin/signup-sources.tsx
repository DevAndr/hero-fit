import type { SourceGroup } from "@/lib/admin/metrics";

const LANDING: Record<string, string> = {
  home: "Главная",
  program: "Программы",
  tool: "Калькуляторы",
  trainer: "Тренер",
  club: "Зал",
  other: "Другие страницы",
  telegram: "Telegram",
};

const REFERRER: Record<string, string> = {
  search: "Поиск",
  social: "Соцсети",
  direct: "Прямой заход",
  site: "Другой сайт",
  telegram: "Telegram",
};

const UNTRACKED = "До учёта";

const label = (dict: Record<string, string>, key: string | null) => (key === null ? UNTRACKED : (dict[key] ?? key));
const percent = (v: number | null) => (v === null ? "—" : `${v} %`);

/** Источники регистраций: страница первого входа с вложенными типами источника. */
export function SignupSources({ groups, range }: { groups: SourceGroup[]; range: 30 | 90 }) {
  return (
    <section aria-label="Источники" className="rounded-xl border bg-card p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="mb-2 text-left font-bold">Источники регистраций за {range} дней</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Страница входа
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Регистраций
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Первая тренировка, %
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Активны на 2-й неделе, %
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                  Нет регистраций за период
                </td>
              </tr>
            ) : (
              groups.flatMap((g) => [
                <tr key={`l:${g.landing}`} className="border-t">
                  <th scope="row" className="px-2 py-1 text-left font-medium">
                    {label(LANDING, g.landing)}
                  </th>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{g.signups}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{percent(g.firstWorkoutPct)}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{percent(g.activeWeek2Pct)}</td>
                </tr>,
                ...g.children.map((c) => (
                  <tr key={`l:${g.landing}:r:${c.referrer}`} className="text-muted-foreground">
                    <th scope="row" className="py-1 pr-2 pl-6 text-left font-normal">
                      {label(REFERRER, c.referrer)}
                    </th>
                    <td className="px-2 py-1 text-right tabular-nums">{c.signups}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(c.firstWorkoutPct)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(c.activeWeek2Pct)}</td>
                  </tr>
                )),
              ])
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Страница первого входа и источник — до регистрации. Активны на 2-й неделе — заходили или тренировались в дни 7–13 после
        регистрации, среди зарегистрированных 14+ дней назад.
      </p>
    </section>
  );
}
