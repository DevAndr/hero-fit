import type { SourceGroup } from "@/lib/admin/metrics";

const LANDING: Record<string, string> = {
  home: "Главная",
  program: "Программы",
  tool: "Калькуляторы",
  trainer: "Тренер",
  club: "Зал",
  other: "Другие страницы",
  telegram: "Telegram",
  "android-app": "Android-приложение",
};

export const REFERRER: Record<string, string> = {
  search: "Поиск",
  social: "Соцсети",
  direct: "Прямой заход",
  site: "Другой сайт",
  telegram: "Telegram",
  app: "Приложение",
};

const UNTRACKED = "До учёта";

const label = (dict: Record<string, string>, key: string | null) => (key === null ? UNTRACKED : (dict[key] ?? key));
const percent = (v: number | null) => (v === null ? "—" : `${v} %`);

/** Подпись о начале учёта заходов: since — первый день учёта, from — первый день периода. */
function visitsNote(since: string | null, from: string): string | null {
  if (since === null) return "Заходов на лендинг пока нет.";
  if (since <= from) return null;
  const [y, m, d] = since.split("-");
  return `Посетители считаются с ${d}.${m}.${y}.`;
}

type TableProps = { groups: SourceGroup[]; range: 30 | 90; visitsSince: string | null; periodFrom: string };

const WEEK2_NOTE = "Активны на 2-й неделе — заходили или тренировались в дни 7–13 после регистрации, среди зарегистрированных 14+ дней назад.";

/** Источники регистраций: страница первого входа с вложенными типами источника. */
export function SignupSources({ groups, range, visitsSince, periodFrom }: TableProps) {
  return (
    <SourceTable
      name="Источники"
      caption={`Источники регистраций за ${range} дней`}
      groupHeader="Страница входа"
      visitorsHeader="Посетители"
      groups={groups}
      groupLabel={(k) => label(LANDING, k)}
      childLabel={(k) => label(REFERRER, k)}
      empty="Нет регистраций и заходов за период"
      note={`Страница первого входа и источник — до регистрации; посетители — новые гости (первый заход), конверсия — регистрации / посетители. ${WEEK2_NOTE}`}
      visitsNote={visitsNote(visitsSince, periodFrom)}
    />
  );
}

/** Рекламные метки: utm_source с вложенными utm_campaign (yandex_direct — Директ без UTM, по yclid). */
export function SignupCampaigns({ groups, range, visitsSince, periodFrom }: TableProps) {
  return (
    <SourceTable
      name="Рекламные метки"
      caption={`Рекламные метки за ${range} дней`}
      groupHeader="utm_source / utm_campaign"
      visitorsHeader="Переходы"
      groups={groups}
      groupLabel={(k) => k ?? ""}
      childLabel={(k) => k ?? "без кампании"}
      empty="Нет регистраций и переходов по ссылкам с метками"
      note={`Метка последнего перехода до регистрации; переходы — каждый заход гостя по ссылке с меткой, конверсия — регистрации / переходы; yandex_direct — Директ без UTM (кампании — в Метрике). ${WEEK2_NOTE}`}
      visitsNote={visitsNote(visitsSince, periodFrom)}
    />
  );
}

function SourceTable(props: {
  name: string;
  caption: string;
  groupHeader: string;
  visitorsHeader: string;
  groups: SourceGroup[];
  groupLabel: (key: string | null) => string;
  childLabel: (key: string | null) => string;
  empty: string;
  note: string;
  visitsNote: string | null;
}) {
  const { groups } = props;
  return (
    <section aria-label={props.name} className="rounded-xl border bg-card p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="mb-2 text-left font-bold">{props.caption}</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="px-2 py-1 text-left font-medium">
                {props.groupHeader}
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
              <th scope="col" className="px-2 py-1 text-right font-medium">
                {props.visitorsHeader}
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Конверсия, %
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">
                  {props.empty}
                </td>
              </tr>
            ) : (
              groups.flatMap((g) => [
                <tr key={`g:${g.key}`} className="border-t">
                  <th scope="row" className="px-2 py-1 text-left font-medium break-all">
                    {props.groupLabel(g.key)}
                  </th>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{g.signups}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{percent(g.firstWorkoutPct)}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{percent(g.activeWeek2Pct)}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{g.visitors ?? "—"}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{percent(g.conversionPct)}</td>
                </tr>,
                ...g.children.map((c) => (
                  <tr key={`g:${g.key}:c:${c.key}`} className="text-muted-foreground">
                    <th scope="row" className="py-1 pr-2 pl-6 text-left font-normal break-all">
                      {props.childLabel(c.key)}
                    </th>
                    <td className="px-2 py-1 text-right tabular-nums">{c.signups}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(c.firstWorkoutPct)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(c.activeWeek2Pct)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{c.visitors ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(c.conversionPct)}</td>
                  </tr>
                )),
              ])
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {props.note}
        {props.visitsNote ? ` ${props.visitsNote}` : null}
      </p>
    </section>
  );
}
