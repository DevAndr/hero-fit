"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Картинка тренировки для сторис: на телефоне — системное «Поделиться» с файлом (Telegram, VK, Instagram…),
 * где файлы отправлять нельзя (ПК) — скачивание PNG.
 */
export function ShareStoryButton({ workoutId, day }: { workoutId: string; day: string }) {
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(`/workouts/${workoutId}/story`);
      if (!res.ok) throw new Error(String(res.status));
      const name = `hero-fit-${day}.png`;
      const file = new File([await res.blob()], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: "Моя тренировка в Hero Fit — hero-fit.ru" });
        } catch (e) {
          // Закрыли меню «Поделиться» — не ошибка
          if ((e as Error).name !== "AbortError") throw e;
        }
        return;
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Не удалось подготовить картинку — попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={share} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Share2 />}
      Поделиться
    </Button>
  );
}
