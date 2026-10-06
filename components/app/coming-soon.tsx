import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";

export function ComingSoon({ title, icon: Icon, text }: { title: string; icon: LucideIcon; text: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
        <Icon className="size-10 text-muted-foreground" />
        <p className="font-semibold">Скоро здесь</p>
        <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      </div>
    </>
  );
}
