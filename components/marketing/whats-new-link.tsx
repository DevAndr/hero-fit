import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { publicReleases } from "@/lib/changelog/public";
import { isRecent } from "@/lib/changelog/view";

/** Плашка «Новое: …» в герое лендинга — последний релиз, если ему не больше 60 дней. */
export async function WhatsNewLink() {
  const [latest] = await publicReleases();
  if (!latest || !isRecent(latest, new Date().toISOString().slice(0, 10))) return null;
  return (
    <Link
      href={`/changelog#${latest.id}`}
      className="hf-rise inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-primary hover:bg-primary/15"
    >
      <Sparkles className="size-4" aria-hidden />
      Новое: {latest.title}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}
