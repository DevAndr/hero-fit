import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ClubForm } from "@/components/club/club-form";
import { requireClubs } from "@/lib/club/access";

export const metadata: Metadata = { title: "Создать клуб" };

/** Заявка на клуб зала: появится в поиске после проверки. */
export default async function NewClubPage() {
  await requireClubs();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Создать клуб" description="Вы станете админом клуба. В поиске он появится после проверки." />
      <ClubForm />
    </div>
  );
}
