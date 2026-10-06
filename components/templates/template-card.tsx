import Link from "next/link";
import { Copy, Pencil, Play } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DeleteTemplateButton } from "@/components/templates/delete-template-button";
import { copyTemplateAction } from "@/lib/templates/actions";
import type { TemplateListItem } from "@/lib/templates/queries";
import { createWorkoutAction } from "@/lib/workouts/actions";

export function TemplateCard({ template }: { template: TemplateListItem }) {
  const own = template.userId !== null;
  const exercises = template.exercises.filter((e) => !e.exercise.archivedAt);

  return (
    <article aria-label={template.name} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{template.name}</h3>
          {own ? <DeleteTemplateButton id={template.id} name={template.name} /> : null}
        </div>
        {template.description ? <p className="text-sm text-muted-foreground">{template.description}</p> : null}
        <ol className="mt-2 space-y-0.5 text-sm">
          {exercises.map((e, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{e.exercise.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">×{e.targetSets}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex gap-2">
        <form action={createWorkoutAction} className="flex-1">
          <input type="hidden" name="source" value={`template:${template.id}`} />
          <Button type="submit" className="w-full" disabled={exercises.length === 0} aria-label={`Начать «${template.name}»`}>
            <Play />
            Начать
          </Button>
        </form>
        {own ? (
          <Link
            href={`/templates/${template.id}`}
            className={buttonVariants({ variant: "outline" })}
            aria-label={`Изменить «${template.name}»`}
          >
            <Pencil />
            Изменить
          </Link>
        ) : (
          <form action={copyTemplateAction}>
            <input type="hidden" name="id" value={template.id} />
            <Button type="submit" variant="outline" aria-label={`Копировать «${template.name}» в мои шаблоны`}>
              <Copy />В мои
            </Button>
          </form>
        )}
      </div>
    </article>
  );
}
