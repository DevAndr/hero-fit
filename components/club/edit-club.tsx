"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClubAction } from "@/lib/club/actions";

type Club = { id: string; name: string; city: string; address: string };

/** Правка названия, города и адреса — админ клуба и модератор. */
export function EditClubButton({ club }: { club: Club }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(club);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (key: "name" | "city" | "address", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`club-${key}`}>{label}</Label>
      <Input id={`club-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setForm(club);
          setError(null);
          setOpen(true);
        }}
      >
        Изменить
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Клуб</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await updateClubAction(club.id, { name: form.name, city: form.city, address: form.address });
                if (!r.ok) return setError(r.error);
                toast.success("Сохранено");
                setOpen(false);
              });
            }}
          >
            {field("name", "Название")}
            {field("city", "Город")}
            {field("address", "Адрес")}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
