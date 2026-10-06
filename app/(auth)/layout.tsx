import Link from "next/link";
import { Dumbbell } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Dumbbell className="size-5" />
        </span>
        Hero Fit
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
