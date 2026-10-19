import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BuiltinProgram } from "@/lib/programs/builtin";

/** Карточка программы: список программ и блок «Другие программы». */
export function ProgramCard({ program: p }: { program: BuiltinProgram }) {
  return (
    <Link href={`/training-programs/${p.slug}`} className="group flex flex-col gap-3 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50 sm:p-6">
      <span className="font-display text-lg font-bold">
        {p.program}
        <ArrowRight className="ml-1.5 inline size-4 align-[-2px] transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
      <span className="text-sm text-muted-foreground">
        {p.level} · {p.perWeek}
      </span>
      <span className="text-sm text-muted-foreground">Дни: {p.days.map((d) => d.name).join(", ")}</span>
    </Link>
  );
}
