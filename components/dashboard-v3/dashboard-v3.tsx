import type { ReactNode } from "react";

export function Tier({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`tier-${title}`} className="space-y-4">
      <h2 id={`tier-${title}`} className="text-lg font-black tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Дашборд v3: блоки кабинета и виджеты недели, разложенные по ярусам «Прогресс» → «Игра» →
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
