import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ShopView } from "@/components/shop/shop-view";
import type { ItemKind } from "@/lib/shop/catalog";
import { requireShop } from "@/lib/shop/access";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { getShopData } from "@/lib/shop/queries";

export const metadata: Metadata = { title: "Магазин" };

const KINDS: ItemKind[] = ["avatar", "frame", "nickColor", "theme"];

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const user = await requireShop();
  const raw = (await searchParams).tab;
  const tab = KINDS.find((k) => k === raw) ?? "avatar";
  const [data, profile] = await Promise.all([
    getShopData(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { nickname: true } }),
  ]);

  return (
    <>
      <PageHeader title="Магазин" description="Монеты за тренировки, рекорды и сундуки — на аватары, рамки, цвет ника и темы" />
      <ShopView tab={tab} data={data} display={profile?.nickname ?? user.name ?? user.login} timeZone={safeTimeZone(user.timeZone)} />
    </>
  );
}
