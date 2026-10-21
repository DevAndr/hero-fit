import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { CampaignList } from "@/components/admin/campaign-list";
import { buttonVariants } from "@/components/ui/button";
import { requireCampaignAdmin } from "@/lib/campaigns/guard";
import { listCampaigns } from "@/lib/campaigns/queries";

export const metadata: Metadata = { title: "Рассылки" };

/** Рассылки по условиям (только админ с флагом campaigns, остальным — 404). */
export default async function CampaignsAdminPage() {
  await requireCampaignAdmin();
  const campaigns = await listCampaigns();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Рассылки"
        description="Уведомления «вернись» по условиям: не заходил, не тренировался, сгорела серия. Не чаще одного в сутки на игрока."
        actions={
          <Link href="/admin/campaigns/new" className={buttonVariants()}>
            <Plus />
            Создать
          </Link>
        }
      />
      <CampaignList campaigns={campaigns} />
    </div>
  );
}
