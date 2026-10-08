import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage, ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Новый пароль", robots: { index: false, follow: true } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Новый пароль</CardTitle>
        <CardDescription>Придумайте новый пароль. Все устройства будут разлогинены.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {typeof token === "string" && token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <FormMessage state={{ message: "В ссылке нет токена сброса." }} />
            <Link href="/forgot-password" className="block text-center text-sm font-medium text-primary hover:underline">
              Запросить новую ссылку
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
