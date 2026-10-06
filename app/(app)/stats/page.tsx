import type { Metadata } from "next";
import { ChartColumn } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Статистика" };

export default function Page() {
  return <ComingSoon title="Статистика" icon={ChartColumn} text="Объём, время в зале, повторы и группы мышц — в цифрах и графиках." />;
}
