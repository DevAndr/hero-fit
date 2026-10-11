"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGuildAction, updateGuildAction } from "@/lib/guild/actions";
import { GuildEmblem } from "@/lib/guild/emblem";
import { GUILD_EMBLEMS } from "@/lib/guild/rules";
import { cn } from "@/lib/utils";

type Saved = { ok: true } | { ok: false; error: string };

/** Название и значок — общая форма создания и настроек гильдии. */
function GuildForm({
  initial,
  submit,
  label,
  onDone,
}: {
  initial: { name: string; emblem: string };
  submit: (v: { name: string; emblem: string }) => Promise<Saved>;
  label: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [emblem, setEmblem] = useState(initial.emblem);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      let res: Saved;
      try {
        res = await submit({ name, emblem });
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
        return;
      }
      if (!res.ok) toast.error(res.error);
      else onDone();
    });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="guild-name">Название</Label>
        <Input id="guild-name" value={name} maxLength={24} placeholder="Например, Железные" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Значок</p>
        <RadioGroup aria-label="Значок" value={emblem} onValueChange={(v) => setEmblem(v as string)} className="grid grid-cols-6 gap-2">
          {GUILD_EMBLEMS.map((e) => (
            <Radio.Root
              key={e.code}
              value={e.code}
              aria-label={e.label}
              title={e.label}
              className={cn(
                "flex h-10 items-center justify-center rounded-lg border transition-colors outline-none",
                "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
              )}
            >
              <GuildEmblem code={e.code} />
            </Radio.Root>
          ))}
        </RadioGroup>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {label}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateGuildButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Создать гильдию
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать гильдию</DialogTitle>
          </DialogHeader>
          {open ? <GuildForm initial={{ name: "", emblem: "shield" }} submit={createGuildAction} label="Создать" onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GuildSettingsButton({ name, emblem }: { name: string; emblem: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Настройки гильдии
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Настройки гильдии</DialogTitle>
          </DialogHeader>
          {open ? <GuildForm initial={{ name, emblem }} submit={updateGuildAction} label="Сохранить" onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** «Вступить по коду» — переход на экран вступления. */
export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.replace(/[\s-]/g, "").toUpperCase();
        if (clean) router.push(`/guild/join/${clean}`);
      }}
    >
      <Input aria-label="Код" placeholder="Код гильдии" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} className="max-w-48" />
      <Button type="submit" variant="outline" disabled={!code.trim()}>
        Вступить по коду
      </Button>
    </form>
  );
}
