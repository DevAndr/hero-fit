import Link from "next/link";
import { Plus, Timer } from "lucide-react";
import { ExerciseFormDialog } from "@/components/exercises/exercise-form-dialog";
import { FavoriteButton, FavoritesProvider } from "@/components/exercises/favorites";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { STRETCH_ZONES, primaryZone, stretchZoneLabel } from "@/lib/stretching/zones";
import { formatClock } from "@/lib/workouts/kinds";

/** Каталог растяжки по зонам: ★ избранного и рекорд удержания у сделанных упражнений. */
export function StretchCatalog({ exercises, records }: { exercises: ExerciseItem[]; records: Record<string, number> }) {
  const sections = STRETCH_ZONES.map((zone) => ({
    zone,
    items: exercises.filter((e) => primaryZone(e.stretchZones) === zone),
  })).filter((s) => s.items.length > 0);

  return (
    <section aria-label="Каталог растяжки" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Каталог</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Свои упражнения меняются и удаляются в «Упражнениях» — здесь только добавление */}
          <Link href="/exercises?group=STRETCH" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Изменить в «Упражнениях»
          </Link>
          <ExerciseFormDialog
            defaultKind="STRETCH"
            trigger={
              <Button variant="outline" size="sm">
                <Plus />
                Новое упражнение
              </Button>
            }
          />
        </div>
      </div>
      <FavoritesProvider exercises={exercises} refreshAfterSave>
        {sections.map(({ zone, items }) => (
          <div key={zone} className="space-y-3">
            <h3 className="flex items-baseline gap-2 font-semibold">
              {stretchZoneLabel(zone)}
              <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="truncate font-semibold">{e.name}</h4>
                    {e.perSide ? <p className="text-xs text-muted-foreground">каждая сторона</p> : null}
                    {records[e.id] ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="hold-record">
                        <Timer className="size-3.5" aria-hidden />
                        Рекорд: {formatClock(records[e.id])}
                      </p>
                    ) : null}
                  </div>
                  <FavoriteButton exercise={e} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </FavoritesProvider>
    </section>
  );
}
