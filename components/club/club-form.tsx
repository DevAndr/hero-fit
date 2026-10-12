"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClubAction, findSimilarAction } from "@/lib/club/actions";

type Form = { name: string; city: string; address: string; contact: string; represent: boolean };
type Similar = { id: string; name: string; address: string };

/** Заявка на клуб: перед отправкой — похожие клубы того же города. */
export function ClubForm() {
  const [form, setForm] = useState<Form>({ name: "", city: "", address: "", contact: "", represent: false });
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const { city, name, address } = form;

  useEffect(() => {
    const timer = setTimeout(() => {
      findSimilarAction({ city, name, address }).then(setSimilar, () => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [city, name, address]);

  if (sent) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-6">
        <p className="flex items-center gap-2 font-bold">
          <CircleCheck className="size-5 text-primary" aria-hidden />
          Заявка отправлена
        </p>
        <p className="text-sm text-muted-foreground">Обычно проверка занимает до суток — пришлём уведомление.</p>
        <Link href="/clubs?list=1" className={buttonVariants({ variant: "outline" })}>
          К клубам
        </Link>
      </div>
    );
  }

  const field = (key: "name" | "city" | "address" | "contact", label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`new-club-${key}`}>{label}</Label>
      <Input id={`new-club-${key}`} value={form[key]} maxLength={120} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <form
      aria-label="Заявка на клуб"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createClubAction(form);
          if (!r.ok) return setError(r.error);
          setError(null);
          setSent(true);
        });
      }}
    >
      {field("name", "Название")}
      {field("city", "Город")}
      {field("address", "Адрес")}
      {similar.length ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">Возможно, ваш зал уже есть</p>
          <ul className="mt-1 space-y-0.5">
            {similar.map((s) => (
              <li key={s.id}>
                <Link href={`/clubs/${s.id}`} className="text-primary underline-offset-4 hover:underline">
                  {s.name}
                </Link>{" "}
                <span className="text-muted-foreground">— {s.address}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {field("contact", "Контакт зала", "Телефон, сайт или страница зала — для проверки, участники его не увидят.")}
      <div className="flex items-start gap-2">
        <Checkbox id="new-club-represent" checked={form.represent} onCheckedChange={(v) => setForm({ ...form, represent: v === true })} />
        <Label htmlFor="new-club-represent" className="leading-snug font-normal">
          Я представляю этот зал
        </Label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Отправить заявку
      </Button>
    </form>
  );
}
