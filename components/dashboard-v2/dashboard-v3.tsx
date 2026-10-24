import type { ReactNode } from "react";
import { Tier } from "./dashboard-v2";

/**
 * Дашборд v3 (флаг dashboard_v3): блоки прежнего дашборда и виджеты v2, разложенные по ярусам «Прогресс» → «Игра» →
 * «Сообщество». Все блоки собирает страница.
 */
export function DashboardV3(props: {
  hero: ReactNode;
  today: ReactNode;
  progress: ReactNode;
  game: ReactNode;
  community: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        {props.hero}
        {props.today}
      </div>
      <Tier title="Прогресс">{props.progress}</Tier>
      <Tier title="Игра">{props.game}</Tier>
      <Tier title="Сообщество">{props.community}</Tier>
      {props.footer}
    </div>
  );
}
