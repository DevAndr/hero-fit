"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sharePng } from "@/lib/share/share-png";

/**
 * Картинка тренировки для сторис: на телефоне — системное «Поделиться» с файлом (Telegram, VK, Instagram…),
 * где файлы отправлять нельзя (ПК) — скачивание PNG.
 */
export function ShareStoryButton({ workoutId, day }: { workoutId: string; day: string }) {
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      await sharePng(`/workouts/${workoutId}/story`, `hero-fit-${day}.png`, "Моя тренировка в Hero Fit — hero-fit.ru");
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
