import { Building2, Store, UserSearch, CalendarDays, CalendarRange, ChartColumn, ClipboardCheck, ClipboardList, Dumbbell, LayoutDashboard, LibraryBig, ListChecks, Shield, Swords, Target, Trophy, Users } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Кабинет", icon: LayoutDashboard, mobile: true },
  { href: "/training", label: "Тренировка", icon: Dumbbell, mobile: true },
  { href: "/calendar", label: "Календарь", icon: CalendarDays, mobile: true },
  { href: "/exercises", label: "Упражнения", icon: ListChecks, mobile: true },
  // На телефоне шаблоны доступны из «Тренировки» и календаря — место в нижней панели у календаря
  { href: "/templates", label: "Шаблоны", icon: ClipboardList, mobile: false },
  { href: "/achievements", label: "Ачивки", icon: Trophy, mobile: true },
  { href: "/goals", label: "Цели", icon: Target, mobile: false },
  { href: "/stats", label: "Статистика", icon: ChartColumn, mobile: false },
  { href: "/friends", label: "Друзья", icon: Users, mobile: false },
  { href: "/guild", label: "Гильдия", icon: Shield, mobile: false },
  { href: "/leaderboard", label: "Рейтинг", icon: Swords, mobile: false },
] as const;

/** Магазин (флаг `shop`): в боковом меню после «Ачивок», на телефоне — в меню профиля. */
export const SHOP_NAV_ITEM = { href: "/shop", label: "Магазин", icon: Store, mobile: false } as const;

/** Клуб зала (флаг `clubs`): в боковом меню после «Гильдии», на телефоне — в меню профиля. */
export const CLUB_NAV_ITEM = { href: "/clubs", label: "Клуб", icon: Building2, mobile: false } as const;

/** Режим тренера: в боковом меню после остальных, на телефоне — в меню профиля. */
export const COACH_NAV_ITEM = { href: "/coach", label: "Клиенты", icon: ClipboardCheck, mobile: false } as const;

/** Календарь клиентов тренера: в боковом меню сразу после «Клиентов», на телефоне — в меню профиля. */
export const COACH_CALENDAR_NAV_ITEM = { href: "/coach/calendar", label: "Календарь клиентов", icon: CalendarRange, mobile: false } as const;

/** Каталог тренеров (флаг `coach_catalog`): не тренеру — в боковом меню после «Друзей», на телефоне — в меню профиля. */
export const TRAINERS_NAV_ITEM = { href: "/trainers", label: "Найти тренера", icon: UserSearch, mobile: false } as const;

/** Каталог программ (флаг `program_catalog`): в боковом меню после «Шаблонов», на телефоне — в меню профиля. */
export const PROGRAMS_NAV_ITEM = { href: "/programs", label: "Каталог программ", icon: LibraryBig, mobile: false } as const;
