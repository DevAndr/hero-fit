import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage, LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: true } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reset } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Вход</CardTitle>
        <CardDescription>С возвращением! Пора качаться.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reset ? <FormMessage state={{ success: true, message: "Пароль изменён. Войдите с новым паролем." }} /> : null}
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link
            href={typeof next === "string" ? `/register?next=${encodeURIComponent(next)}` : "/register"}
            className="font-medium text-primary hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
