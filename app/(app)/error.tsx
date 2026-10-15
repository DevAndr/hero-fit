"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sendErrorReport } from "@/components/errors/send-report";
import { Button, buttonVariants } from "@/components/ui/button";

/** Страница кабинета упала: понятный экран вместо заглушки Next. С `digest` — ошибка сервера, она уже записана. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) sendErrorReport(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-black">Что-то пошло не так</h1>
      <p className="mt-2 text-sm text-muted-foreground">Мы уже знаем об ошибке. Попробуйте обновить страницу.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => retry()}>Обновить</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          В кабинет
        </Link>
      </div>
    </div>
  );
}
