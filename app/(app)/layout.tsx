import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
