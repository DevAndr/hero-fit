"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { COIN_RATES } from "@/lib/shop/coins";
import { coinWord } from "@/lib/shop/labels";

const ROWS: { label: string; value: string }[] = [
  { label: `Тренировка (от ${COIN_RATES.minWorkingSets} рабочих подходов, не больше ${COIN_RATES.workoutsPerDay} в день)`, value: `${COIN_RATES.workout}` },
  { label: `Рекорд в упражнении (до ${COIN_RATES.recordsPerWorkout} за тренировку)`, value: `${COIN_RATES.record}` },
  { label: "Ежедневный сундук", value: `${COIN_RATES.dailyChest}, редкий — ${COIN_RATES.dailyChestRare}` },
  { label: "Сундук босса недели", value: `${COIN_RATES.bossChest}` },
  { label: "Сундук рейда", value: `${COIN_RATES.raidChest}, MVP — ${COIN_RATES.raidChestMvp}` },
  { label: "Сундук цели", value: `${COIN_RATES.goalChest}` },
  { label: "Сундук задания клуба", value: `${COIN_RATES.clubTaskChest}` },
  { label: "Ачивка", value: `${COIN_RATES.achievementMin}–${COIN_RATES.achievementMax}, по награде в XP` },
  { label: "Неделя серии", value: `${COIN_RATES.streakWeekBase} + ${COIN_RATES.streakWeekStep} за каждую неделю серии, до ${COIN_RATES.streakWeekMax}` },
  { label: "Новый уровень N", value: `${COIN_RATES.levelBase} + ${COIN_RATES.levelStep} × N` },
];

/** «Как заработать» — таблица ставок. */
export function EarnDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Info />
        Как заработать
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Как заработать монеты</DialogTitle>
          <DialogDescription>Монеты начисляются сами, когда ты тренируешься и открываешь сундуки.</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>За что</th>
              <th>Сколько {coinWord(5)}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b last:border-0">
                <td className="py-2 pr-3">{r.label}</td>
                <td className="py-2 text-right font-semibold whitespace-nowrap tabular-nums">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
