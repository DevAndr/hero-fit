"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplateEditor } from "@/components/templates/template-editor";
import type { ExerciseItem } from "@/lib/exercises/queries";

/** Новый шаблон поверх окна программы: тот же редактор, что в «Шаблонах»; после сохранения — onSaved, окно закрывается. */
export function NewTemplateDialog({
  open,
  exercises,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  exercises: ExerciseItem[];
  onOpenChange: (open: boolean) => void;
  onSaved: (template: { id: string; name: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Новый шаблон</DialogTitle>
        </DialogHeader>
        {open ? <TemplateEditor exercises={exercises} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}
