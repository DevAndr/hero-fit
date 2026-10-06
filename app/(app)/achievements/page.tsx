import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Ачивки" };

export default function Page() {
  return <ComingSoon title="Ачивки" icon={Trophy} text="Ачивки за тренировки, streak, прогресс в весе и подходы." />;
}
