import Link from "next/link";
import { MapPin } from "lucide-react";
import { CoachContacts } from "@/components/coach/coach-contacts";
import { aboutPreview } from "@/lib/coach/catalog";
import type { CatalogItem } from "@/lib/coach/catalog-queries";
import { FORMAT_LABELS, SPECIALTIES } from "@/lib/coach/profile";

/** Карточка тренера в каталоге /trainers. */
export function TrainerCard({ item, signedIn, nextPath }: { item: CatalogItem; signedIn: boolean; nextPath: string }) {
  const specialties = item.specialties.map((c) => SPECIALTIES[c]).filter(Boolean);
  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">{item.name}</h2>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {item.city ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {item.city}
            </span>
          ) : null}
          <span>{FORMAT_LABELS[item.format]}</span>
        </p>
      </div>
      {specialties.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Специализации">
          {specialties.map((s) => (
            <li key={s} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {s}
            </li>
          ))}
        </ul>
      ) : null}
      {item.about ? <p className="text-sm text-pretty">{aboutPreview(item.about)}</p> : null}
      <CoachContacts coachId={item.userId} contacts={item.contacts} signedIn={signedIn} nextPath={nextPath} />
      <Link href={`/trainer/${encodeURIComponent(item.nickname)}`} className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
        Подробнее
      </Link>
    </li>
  );
}
