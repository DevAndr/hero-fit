import Link from "next/link";
import { connection } from "next/server";
import { Dumbbell, Flame, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";

const features = [
  { icon: Zap, title: "Уровни и XP", text: "Каждый подход, повтор и килограмм приближают новый уровень." },
  { icon: Flame, title: "Режим «в ударе»", text: "Тренируйся без перерывов дольше 24 часов и держи streak." },
  { icon: Trophy, title: "Ачивки", text: "Награды генерируются по твоему реальному прогрессу." },
];

export default async function Home() {
  await connection();
  const [exercises, programs] = await Promise.all([
    db.exercise.count({ where: { userId: null } }),
    db.workoutTemplate.count({ where: { userId: null } }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-4 py-16">
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
          <Dumbbell className="size-4 text-primary" />
          {exercises} упражнений · {programs} готовых программ
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
          Тренируйся как <span className="text-primary">герой</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Hero Fit превращает тренировки в игру: прокачивай уровень, бей личные рекорды и собирай ачивки.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/register" />}>
            Начать
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
            Войти
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <CardContent className="space-y-2">
              <Icon className="size-5 text-primary" />
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
