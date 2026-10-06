import { ChartColumn, ClipboardList, Dumbbell, LayoutDashboard, ListChecks, Trophy } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Кабинет", icon: LayoutDashboard, mobile: true },
  { href: "/training", label: "Тренировка", icon: Dumbbell, mobile: true },
  { href: "/exercises", label: "Упражнения", icon: ListChecks, mobile: true },
  { href: "/templates", label: "Шаблоны", icon: ClipboardList, mobile: true },
  { href: "/achievements", label: "Ачивки", icon: Trophy, mobile: true },
  { href: "/stats", label: "Статистика", icon: ChartColumn, mobile: false },
] as const;
