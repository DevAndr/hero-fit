import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { CampaignForm, EMPTY_DRAFT } from "@/components/admin/campaign-form";
import { requireCampaignAdmin } from "@/lib/campaigns/guard";

export const metadata: Metadata = { title: "Новая рассылка" };

export default async function NewCampaignPage() {
  await requireCampaignAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Новая рассылка" description="Сохраняется черновиком: запустить можно после проверки." />
      <CampaignForm initial={EMPTY_DRAFT} />
    </div>
  );
}
