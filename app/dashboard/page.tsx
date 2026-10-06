import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Личный кабинет" };

// Временная страница: полноценный дашборд — отдельным этапом.
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Привет, {user.name ?? user.login}!</CardTitle>
          <CardDescription>
            Уровень {user.level} · {user.xp} XP · streak {user.currentStreak}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              <LogOut />
              Выйти
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
