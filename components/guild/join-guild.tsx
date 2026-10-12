"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { joinGuildAction } from "@/lib/guild/actions";

export function JoinGuildButton({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Успех — redirect("/guild") из action
          const res = await joinGuildAction(code);
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      Вступить
    </Button>
  );
}
