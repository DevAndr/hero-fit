"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFlag } from "@/components/flags/flags-provider";
import { publishProgramAction } from "@/lib/catalog/actions";
import { CATALOG_DESCRIPTION_MAX } from "@/lib/catalog/rules";
import { deleteProgramAction, saveProgramAction } from "@/lib/coach/program-actions";
import { programPreview, type ProgramRule } from "@/lib/coach/program";
import type { ProgramView } from "@/lib/coach/program-queries";
import { WEEKDAYS_SHORT } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

type Template = { id: string; name: string };
type Day = { weekday: number; templateId: string; time: string };

const num = (v: string) => Number(v.replace(",", "."));
const kg = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг`;

/** Кривая «неделя → вес» на базе 100 кг; разгрузки выделены. */
export function ProgramPreview({ rule, base = 100 }: { rule: ProgramRule; base?: number }) {
  return (
    <ol aria-label="Предпросмотр по неделям" className="flex flex-wrap gap-1.5 text-xs tabular-nums">
      {programPreview(rule, { weight: base, fromWeek: 1 }).map((w) => (
        <li key={w.week} className={cn("rounded-md border px-2 py-1", w.deload && "border-dashed text-muted-foreground")}>
          {w.week}: {kg(w.weight)}
          {w.deload ? " ↓" : ""}
        </li>
      ))}
    </ol>
  );
}

function ProgramDialog({ program, templates, onClose }: { program: ProgramView | null; templates: Template[]; onClose: () => void }) {
  const [name, setName] = useState(program?.name ?? "");
  const [weeks, setWeeks] = useState(String(program?.rule.weeks ?? 8));
  const [stepKind, setStepKind] = useState<"PERCENT" | "KG">(program?.rule.stepKind ?? "PERCENT");
  const [stepValue, setStepValue] = useState(String(program?.rule.stepValue ?? 2.5).replace(".", ","));
  const [deload, setDeload] = useState(program ? program.rule.deloadEvery !== null : true);
  const [deloadEvery, setDeloadEvery] = useState(String(program?.rule.deloadEvery ?? 4));
  const [deloadPct, setDeloadPct] = useState(String(program?.rule.deloadPct ?? 10));
  const [days, setDays] = useState<Day[]>(program?.days.map(({ weekday, templateId, time }) => ({ weekday, templateId, time })) ?? []);
  const [publish, setPublish] = useState(program?.catalog.published ?? false);
  const [description, setDescription] = useState(program?.catalog.description ?? "");
  const [pending, startTransition] = useTransition();
  const catalogOn = useFlag("program_catalog");
  // Публикация нужна уже существующей программе: у новой ещё нет id
  const catalog = catalogOn && program !== null;
  const hidden = program?.catalog.hidden ?? false;

  const rule: ProgramRule = {
    weeks: Math.min(16, Math.max(2, Math.round(num(weeks)) || 2)),
    stepKind,
    stepValue: num(stepValue) || 0,
    deloadEvery: deload ? Math.round(num(deloadEvery)) || null : null,
    deloadPct: num(deloadPct) || 0,
  };
  const toggleDay = (weekday: number) =>
    setDays((prev) =>
      prev.some((d) => d.weekday === weekday)
        ? prev.filter((d) => d.weekday !== weekday)
        : [...prev, { weekday, templateId: templates[0]?.id ?? "", time: "18:00" }].sort((a, b) => a.weekday - b.weekday),
    );
  const patchDay = (weekday: number, patch: Partial<Day>) => setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  const save = () =>
    startTransition(async () => {
      const result = await saveProgramAction(program?.id ?? null, {
        name,
        weeks: Math.round(num(weeks)),
        stepKind,
        stepValue: num(stepValue),
        deloadEvery: deload ? Math.round(num(deloadEvery)) : null,
        deloadPct: num(deloadPct),
        days: days.map((d) => ({ ...d, durationMin: 60 })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const catalogChanged = catalog && !hidden && (publish !== program.catalog.published || description.trim() !== program.catalog.description);
      if (catalogChanged) {
        const published = await publishProgramAction(program.id, { publish, description });
        if (!published.ok) {
          toast.error(published.error);
          return;
        }
      }
      toast.success(program ? "Программа сохранена" : "Программа создана");
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{program ? "Изменить программу" : "Новая программа"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="program-name">Название</Label>
          <Input id="program-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Сила, 8 недель" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="program-weeks">Недель</Label>
            <Input id="program-weeks" {...selectOnFocus} inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="program-step">Шаг в неделю</Label>
            <div className="flex gap-1">
              <Input id="program-step" {...selectOnFocus} inputMode="decimal" value={stepValue} onChange={(e) => setStepValue(e.target.value)} />
              <Select items={[{ value: "PERCENT", label: "%" }, { value: "KG", label: "кг" }]} value={stepKind} onValueChange={(v) => v && setStepKind(v as "PERCENT" | "KG")}>
                <SelectTrigger aria-label="Единица шага" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">%</SelectItem>
                  <SelectItem value="KG">кг</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={deload} onCheckedChange={(v) => setDeload(Boolean(v))} />
            Разгрузочные недели
          </Label>
          {deload ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="program-deload-every">Каждая N-я неделя</Label>
                <Input id="program-deload-every" {...selectOnFocus} inputMode="numeric" value={deloadEvery} onChange={(e) => setDeloadEvery(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="program-deload-pct">Вес ниже на, %</Label>
                <Input id="program-deload-pct" {...selectOnFocus} inputMode="decimal" value={deloadPct} onChange={(e) => setDeloadPct(e.target.value)} />
              </div>
            </div>
          ) : null}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Дни недели</legend>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS_SHORT.map((label, weekday) => {
              const on = days.some((d) => d.weekday === weekday);
              return (
                <Button key={label} type="button" size="sm" variant={on ? "secondary" : "outline"} aria-pressed={on} onClick={() => toggleDay(weekday)}>
                  {label}
                </Button>
              );
            })}
          </div>
          {templates.length === 0 ? <p className="text-sm text-muted-foreground">Сначала создайте шаблон тренировки в разделе «Шаблоны».</p> : null}
          {days.map((d) => (
            <div key={d.weekday} className="grid grid-cols-[2.5rem_1fr_6.5rem] items-center gap-2">
              <span className="text-sm font-medium">{WEEKDAYS_SHORT[d.weekday]}</span>
              <Select items={templates.map((t) => ({ value: t.id, label: t.name }))} value={d.templateId || null} onValueChange={(v: string | null) => patchDay(d.weekday, { templateId: v ?? "" })}>
                <SelectTrigger aria-label={`Шаблон, ${WEEKDAYS_SHORT[d.weekday]}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="time" step={900} aria-label={`Время, ${WEEKDAYS_SHORT[d.weekday]}`} value={d.time} onChange={(e) => patchDay(d.weekday, { time: e.target.value })} />
            </div>
          ))}
        </fieldset>
        {catalog ? (
          <fieldset className="grid gap-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Каталог программ</legend>
            {hidden ? (
              <p className="text-sm text-destructive">Снята администратором{program?.catalog.hiddenReason ? `: ${program.catalog.hiddenReason}` : ""}</p>
            ) : null}
            <Label htmlFor="program-publish" className="flex items-center gap-2 font-normal">
              <Switch id="program-publish" checked={publish} disabled={hidden} onCheckedChange={setPublish} />
              Опубликовать в каталоге
            </Label>
            <div className="grid gap-1.5">
              <Label htmlFor="program-catalog-description">Описание для каталога</Label>
              <Textarea
                id="program-catalog-description"
                value={description}
                disabled={hidden}
                rows={3}
                maxLength={CATALOG_DESCRIPTION_MAX}
                placeholder="Для кого, цель, инвентарь"
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>Для кого, цель, инвентарь</span>
                <span className="tabular-nums">
                  {description.length} / {CATALOG_DESCRIPTION_MAX}
                </span>
              </p>
            </div>
          </fieldset>
        ) : catalogOn ? (
          <p className="text-sm text-muted-foreground">Сохраните программу, чтобы опубликовать её в каталоге</p>
        ) : null}
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Вес по неделям при базе 100 кг</p>
          <ProgramPreview rule={rule} />
          <p className="text-xs text-muted-foreground">Изменения — для новых назначений</p>
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Библиотека программ: список, создание, правка, удаление. */
export function ProgramLibrary({ programs, templates }: { programs: ProgramView[]; templates: Template[] }) {
  const [editing, setEditing] = useState<ProgramView | "new" | null>(null);
  const [removing, setRemoving] = useState<ProgramView | null>(null);
  const [pending, startTransition] = useTransition();
  const catalogOn = useFlag("program_catalog");

  const remove = (p: ProgramView) =>
    startTransition(async () => {
      const result = await deleteProgramAction(p.id);
      if (result.ok) toast.success("Программа удалена");
      else toast.error(result.error);
      setRemoving(null);
    });

  return (
    <div className="space-y-3">
      <Button type="button" onClick={() => setEditing("new")}>
        <Plus />
        Новая программа
      </Button>
      {programs.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          Программа — неделя тренировок по шаблонам и правило: на сколько растёт вес и когда разгрузка. Назначается клиенту во вкладке «План».
        </p>
      ) : (
        <ul className="space-y-2">
          {programs.map((p) => (
            <li key={p.id} aria-label={p.name} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  {catalogOn && p.catalog.published && !p.catalog.hidden ? (
                    <p className="text-xs font-medium text-primary">В каталоге · занимаются {p.participants}</p>
                  ) : null}
                  {catalogOn && p.catalog.hidden ? <p className="text-xs font-medium text-destructive">Снята администратором</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {p.rule.weeks} нед. · +{p.rule.stepValue.toLocaleString("ru-RU")} {p.rule.stepKind === "PERCENT" ? "%" : "кг"} в неделю
                    {p.rule.deloadEvery ? ` · разгрузка каждая ${p.rule.deloadEvery}-я −${p.rule.deloadPct} %` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.days.map((d) => `${WEEKDAYS_SHORT[d.weekday]} — ${d.templateName}`).join(" · ")}</p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Изменить «${p.name}»`} onClick={() => setEditing(p)}>
                    <Pencil />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Удалить «${p.name}»`} onClick={() => setRemoving(p)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <ProgramPreview rule={p.rule} />
            </li>
          ))}
        </ul>
      )}
      {editing ? <ProgramDialog program={editing === "new" ? null : editing} templates={templates} onClose={() => setEditing(null)} /> : null}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{removing?.name}»?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">У клиентов, которым программа уже назначена, она продолжится.</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => removing && remove(removing)}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
