import { COACH_NAV_ITEM, NAV_ITEMS } from "@/components/app/nav";

/** Корневые разделы Mini App: системная «Назад» на них скрыта. */
const ROOTS: string[] = [...NAV_ITEMS.map((i) => i.href), COACH_NAV_ITEM.href];

export function isRootPath(pathname: string) {
  return ROOTS.includes(pathname);
}

/** Куда ведёт «Назад», если в истории приложения ничего нет: ближайший раздел, иначе кабинет. */
export function backTarget(pathname: string): string | null {
  if (isRootPath(pathname)) return null;
  // Тренировки живут под /workouts, а раздел у них — «Тренировка»
  if (pathname.startsWith("/workouts/")) return "/training";
  // Приглашение тренера открывает клиент — раздел /coach у него 404
  if (pathname.startsWith("/coach/join/")) return "/dashboard";
  const parent = ROOTS.filter((root) => pathname.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)[0];
  return parent ?? "/dashboard";
}
