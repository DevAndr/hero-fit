"use client";

import { useEffect } from "react";
import { sendErrorReport } from "@/components/errors/send-report";

/** Необработанные ошибки и отклонённые промисы браузера — в журнал ошибок. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => sendErrorReport(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => sendErrorReport(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
