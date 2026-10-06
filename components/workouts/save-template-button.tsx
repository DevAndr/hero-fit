"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveAsTemplateAction } from "@/lib/workouts/actions";

export function SaveTemplateButton({ workoutId, defaultName }: { workoutId: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await saveAsTemplateAction(workoutId, name);
      if (result.ok) {
        toast.success(`Шаблон «${name.trim()}» сохранён`);
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <BookmarkPlus />
            Сохранить как шаблон
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сохранить как шаблон</DialogTitle>
          <DialogDescription>В следующий раз тренировку можно будет начать в один клик.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="template-name">Название шаблона</FieldLabel>
          <Input id="template-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
