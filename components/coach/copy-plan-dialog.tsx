"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ClientPicker } from "@/components/coach/client-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { plural } from "@/lib/format";
import type { CoachGroupView } from "@/lib/coach/groups";
import { copyPlanText } from "@/lib/coach/plan-copy";
import { copyPlanAction } from "@/lib/coach/plan-actions";

/** Числа для обоих положений галочки «С весами»: on — с весами, off — без. */
export type CopySummary = { on: string; off: string };
export type CopyRecipient = { id: string; name: string; overwrite: { on: number; off: number } };

/** «Скопировать план» во вкладке «План»: будущие назначения и задания клиента — другим клиентам тренера. */
export function CopyPlanButton({
  sourceId,
  summary,
  recipients,
  groups,
}: {
  sourceId: string;
  summary: CopySummary;
  recipients: CopyRecipient[];
  groups: CoachGroupView[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Copy />
        Скопировать план
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Скопировать план</DialogTitle>
          </DialogHeader>
          {/* Форма монтируется заново при каждом открытии — выбор не переживает закрытие */}
          {open ? <CopyPlanForm sourceId={sourceId} summary={summary} recipients={recipients} groups={groups} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CopyPlanForm({
  sourceId,
  summary,
  recipients,
  groups,
  onDone,
}: {
  sourceId: string;
  summary: CopySummary;
  recipients: CopyRecipient[];
  groups: CoachGroupView[];
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [withWeights, setWithWeights] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof copyPlanAction>>;
      try {
        res = await copyPlanAction(sourceId, picked, { withWeights });
      } catch {
        toast.error("Не удалось скопировать — проверьте связь");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(copyPlanText(res.copied, res.skipped));
      onDone();
    });

  const mode = withWeights ? "on" : "off";
  const clients = recipients.map((r) => {
    const n = r.overwrite[mode];
    // Без весов перезапись стирает вес и шаг получателя — тренер должен это видеть
    const hint = n ? `перезапишется ${n} ${plural(n, "задание", "задания", "заданий")}${withWeights ? "" : " · вес и шаг сбросятся"}` : undefined;
    return { id: r.id, name: r.name, hint };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Будет скопировано: {summary[mode]}</p>
      <ClientPicker clients={clients} groups={groups} picked={picked} onChange={setPicked} />
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox checked={withWeights} onCheckedChange={(v) => setWithWeights(v === true)} />С весами
      </Label>
      <p className="-mt-2 text-xs text-muted-foreground">Без галочки — только подходы и повторы: вес клиент берёт из своей истории.</p>
      <DialogFooter>
        <Button onClick={submit} disabled={!picked.length || pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Скопировать
        </Button>
      </DialogFooter>
    </div>
  );
}
