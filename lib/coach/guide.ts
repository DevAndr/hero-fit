/** «Первые шаги тренера» на /coach: шаги отмечаются по факту, без ручных галочек. */

export type CoachGuideFacts = {
  published: boolean;
  /** Клиентов за всё время (и бывших) — приглашение уже получилось. */
  everClients: number;
  templates: number;
  assigned: boolean;
  commented: boolean;
  programs: number;
  /** Активный клиент для ссылок «Назначить» и «Прокомментировать»; нет — эти шаги ждут клиента. */
  clientId: string | null;
};

export type CoachGuideStep = {
  key: "page" | "invite" | "template" | "assign" | "comment" | "program";
  title: string;
  hint: string;
  done: boolean;
  /** Куда ведёт «Сделать»; null — шаг выполнен или пока недоступен. */
  href: string | null;
  /** Почему шаг пока недоступен. */
  locked: string | null;
};

const NEED_CLIENT = "Сначала пригласите клиента";

export function coachGuide(f: CoachGuideFacts) {
  const client = (tab: string) => (f.clientId ? `/coach/clients/${f.clientId}?tab=${tab}` : null);
  const steps: CoachGuideStep[] = [
    { key: "page", title: "Опубликуйте страницу тренера", hint: "Фото, специализация и цифры — по ней клиенты находят вас", done: f.published, href: "/coach/page", locked: null },
    { key: "invite", title: "Пригласите первого клиента", hint: "Отправьте ссылку — после согласия он появится в списке", done: f.everClients > 0, href: "#invite", locked: null },
    { key: "template", title: "Соберите шаблон тренировки", hint: "Упражнения, подходы и веса — основа для назначений", done: f.templates > 0, href: "/templates/new", locked: null },
    { key: "assign", title: "Назначьте тренировку клиенту", hint: "Разово или по дням недели — она появится у него в плане", done: f.assigned, href: client("plan"), locked: null },
    { key: "comment", title: "Прокомментируйте тренировку клиента", hint: "Похвалите или поправьте технику — клиенту придёт уведомление", done: f.commented, href: client("workouts"), locked: null },
    { key: "program", title: "Соберите программу на несколько недель", hint: "Вес растёт по неделям сам, с разгрузками", done: f.programs > 0, href: "/coach/programs", locked: null },
  ];
  for (const s of steps) {
    if (s.done) s.href = null;
    else if ((s.key === "assign" || s.key === "comment") && !f.clientId) s.locked = NEED_CLIENT;
  }
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
