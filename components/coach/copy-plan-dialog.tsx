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
import { copyPlanText } from "@/lib/coach/plan-copy";
import { copyPlanAction } from "@/lib/coach/plan-actions";

export type CopyRecipient = { id: string; name: string; overwrite: number };

/** «Скопировать план» во вкладке «План»: будущие назначения и задания клиента — другим клиентам тренера. */
export function CopyPlanButton({ sourceId, summary, recipients }: { sourceId: string; summary: string; recipients: CopyRecipient[] }) {
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
          {open ? <CopyPlanForm sourceId={sourceId} summary={summary} recipients={recipients} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CopyPlanForm({
  sourceId,
  summary,
  recipients,
  onDone,
}: {
  sourceId: string;
  summary: string;
  recipients: CopyRecipient[];
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

  const clients = recipients.map((r) => ({
    id: r.id,
    name: r.name,
    hint: r.overwrite ? `перезапишется ${r.overwrite} ${plural(r.overwrite, "задание", "задания", "заданий")}` : undefined,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Будет скопировано: {summary}</p>
      <ClientPicker clients={clients} picked={picked} onChange={setPicked} />
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
