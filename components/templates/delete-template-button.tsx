"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { deleteTemplateAction } from "@/lib/templates/actions";

export function DeleteTemplateButton({ id, name, assignedClients = 0 }: { id: string; name: string; assignedClients?: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Удалить «${name}»`} className="text-muted-foreground" />}
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить шаблон «{name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Прошедшие тренировки по этому шаблону останутся в истории.
            {assignedClients
              ? ` Назначен ${assignedClients} ${plural(assignedClients, "клиенту", "клиентам", "клиентам")} — в их календаре останется только название, упражнений не будет.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const { ok } = await deleteTemplateAction(id);
                if (ok) toast.success(`Шаблон «${name}» удалён`);
                else toast.error("Шаблон не найден");
              })
            }
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
