import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { CampaignControls } from "@/components/admin/campaign-controls";
import { CampaignForm } from "@/components/admin/campaign-form";
import { CampaignStatusBadge } from "@/components/admin/campaign-list";
import { requireCampaignAdmin } from "@/lib/campaigns/guard";
import { getCampaign } from "@/lib/campaigns/queries";

export const metadata: Metadata = { title: "Рассылка" };

export default async function CampaignPage({ params }: PageProps<"/admin/campaigns/[id]">) {
  await requireCampaignAdmin();
  const c = await getCampaign((await params).id);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={c.name} actions={<CampaignStatusBadge status={c.status} />} />
      <CampaignControls id={c.id} status={c.status} />
      {c.status === "ARCHIVED" ? null : (
        // key: после смены статуса форма берёт значения с сервера
        <CampaignForm
          key={c.status}
          initial={{ id: c.id, name: c.name, condition: c.condition, days: c.days, title: c.title, body: c.body, url: c.url, push: c.push, telegram: c.telegram, hour: c.hour }}
        />
      )}
      <Link href="/admin/campaigns" className="text-sm text-muted-foreground hover:underline">
        Все рассылки
      </Link>
    </div>
  );
}
