"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { AssignDialog, type AssignClient, type AssignDialogState, type AssignTemplate } from "@/components/coach/assign-dialog";
import { Button } from "@/components/ui/button";
import type { CoachGroupView } from "@/lib/coach/groups";

/** «Назначить нескольким» над списком клиентов: тот же диалог назначения с выбором клиентов. */
export function AssignManyButton({
  clients,
  groups,
  templates,
  today,
}: {
  clients: AssignClient[];
  groups: CoachGroupView[];
  templates: AssignTemplate[];
  today: string;
}) {
  const [dialog, setDialog] = useState<AssignDialogState | null>(null);
  return (
    <>
      <Button variant="outline" onClick={() => setDialog({ mode: "many", date: today })}>
        <Users />
        Назначить нескольким
      </Button>
      <AssignDialog clientId={null} clients={clients} groups={groups} state={dialog} templates={templates} onClose={() => setDialog(null)} />
    </>
  );
}
