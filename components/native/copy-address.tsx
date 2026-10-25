"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Адрес нашего ntfy и «Скопировать адрес» — вставить в ntfy → Настройки → Сервер по умолчанию. */
export function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-muted px-2 py-1 text-sm">{value}</code>
      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true), () => {})}>
        <Copy />
        {copied ? "Скопировано" : "Скопировать адрес"}
      </Button>
    </div>
  );
}
