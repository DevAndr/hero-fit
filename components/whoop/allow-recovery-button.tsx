"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsentDialog } from "@/components/whoop/consent-dialog";

/** «Разрешить» у старого подключения: согласие и повторный вход в WHOOP с новыми правами. */
export function AllowRecoveryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Разрешить
      </Button>
      <ConsentDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
