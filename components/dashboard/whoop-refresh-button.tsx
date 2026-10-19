"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshWhoopRecoveryAction } from "@/lib/whoop/actions";

export function WhoopRefreshButton() {
  const [loading, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={() =>
        start(async () => {
          let status: Awaited<ReturnType<typeof refreshWhoopRecoveryAction>>["status"];
          try {
            status = (await refreshWhoopRecoveryAction()).status;
          } catch {
            status = "unavailable";
          }
          if (status === "throttled") toast("Обновить можно через минуту");
          else if (status === "unavailable") toast.error("WHOOP не отвечает, попробуйте позже");
          else if (status === "reauth") toast.error("Переподключите WHOOP");
        })
      }
    >
      {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Обновить
    </Button>
  );
}
