import { CalendarDays, ChartColumn, ClipboardCheck, ClipboardList, Dumbbell, LayoutDashboard, ListChecks, Swords, Trophy, Users } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Кабинет", icon: LayoutDashboard, mobile: true },
  { href: "/training", label: "Тренировка", icon: Dumbbell, mobile: true },
  { href: "/calendar", label: "Календарь", icon: CalendarDays, mobile: true },
  { href: "/exercises", label: "Упражнения", icon: ListChecks, mobile: true },
  // На телефоне шаблоны доступны из «Тренировки» и календаря — место в нижней панели у календаря
  { href: "/templates", label: "Шаблоны", icon: ClipboardList, mobile: false },
  { href: "/achievements", label: "Ачивки", icon: Trophy, mobile: true },
  { href: "/stats", label: "Статистика", icon: ChartColumn, mobile: false },
  { href: "/friends", label: "Друзья", icon: Users, mobile: false },
  { href: "/leaderboard", label: "Рейтинг", icon: Swords, mobile: false },
] as const;

/** Режим тренера: в боковом меню после остальных, на телефоне — в меню профиля. */
export const COACH_NAV_ITEM = { href: "/coach", label: "Клиенты", icon: ClipboardCheck, mobile: false } as const;
