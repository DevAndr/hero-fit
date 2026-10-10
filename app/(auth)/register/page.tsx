import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Регистрация — бесплатный дневник тренировок",
  description: "Создай аккаунт Hero Fit за минуту: уровни и XP за тренировки, недельный streak, ачивки, рекорды и готовые программы. Бесплатно.",
  alternates: { canonical: "/register" },
};

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next, coach } = await searchParams;
  // С публичной страницы тренера — после регистрации сразу экран согласия
  const back = typeof next === "string" ? next : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Регистрация</CardTitle>
        <CardDescription>Создай героя и начни прокачку с 1 уровня.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ?coach=1 — с лендинга «Стать тренером»: галочка «Я тренер» уже отмечена */}
        <RegisterForm next={back} coach={coach === "1"} />
        <p className="text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href={back ? `/login?next=${encodeURIComponent(back)}` : "/login"} className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
