import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Тренировка" };

export default function Page() {
  return <ComingSoon title="Тренировка" icon={Dumbbell} text="Сбор тренировки, подходы, таймер отдыха и сводка — следующий этап." />;
}
