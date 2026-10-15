"use client";

import { useEffect } from "react";
import { sendErrorReport } from "@/components/errors/send-report";
import "./globals.css";

/** Упал корневой layout: свой документ (глобальная тема сюда не доходит — тёмная, как по умолчанию). */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) sendErrorReport(error);
  }, [error]);
  return (
    <html lang="ru" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <title>Ошибка · Hero Fit</title>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-black">Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-muted-foreground">Мы уже знаем об ошибке. Попробуйте обновить страницу.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
