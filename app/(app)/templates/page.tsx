import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Шаблоны" };

export default function Page() {
  return <ComingSoon title="Шаблоны" icon={ClipboardList} text="Свои шаблоны и готовые программы: Push/Pull/Legs, Full Body, 5×5." />;
}
