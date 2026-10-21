"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationType, type CampaignStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireCampaignAdmin } from "./guard";
import { campaignAudience } from "./conditions";
import { canEditCondition } from "./rules";
import { campaignSchema } from "./schema";
import { notify } from "@/lib/notifications/service";

export type SaveState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> } | null;
type Result = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Рассылка не найдена — обновите страницу";
const LOCKED = "Условие меняется только у черновика или на паузе";

/** Переходы статуса: DRAFT→ACTIVE, ACTIVE↔PAUSED, PAUSED/ACTIVE→ARCHIVED. */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

/** Создать черновик (без id) или обновить рассылку из формы; после создания — на список. */
export async function saveCampaignAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const me = await requireCampaignAdmin();
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const key = String(i.path[0] ?? "form");
      fieldErrors[key] ??= i.message;
    }
    return { ok: false, error: "Проверьте поля формы", fieldErrors };
  }
  const c = parsed.data;
  const data = { name: c.name, condition: c.condition, days: c.days, title: c.title, body: c.body, url: c.url, push: c.push, telegram: c.telegram, hour: c.hour };
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    const current = await db.campaign.findUnique({ where: { id } });
    if (!current || current.status === "ARCHIVED") return { ok: false, error: NOT_FOUND };
    if (!canEditCondition(current.status) && (current.condition !== c.condition || current.days !== c.days)) return { ok: false, error: LOCKED };
    await db.campaign.update({ where: { id }, data });
    console.info(`[campaigns] ${me.login}: save ${id}`);
    revalidatePath("/admin/campaigns");
    return { ok: true };
  }
  const created = await db.campaign.create({ data: { ...data, status: "DRAFT" }, select: { id: true } });
  console.info(`[campaigns] ${me.login}: create ${created.id}`);
  revalidatePath("/admin/campaigns");
  redirect("/admin/campaigns");
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus): Promise<Result> {
  const me = await requireCampaignAdmin();
  const current = await db.campaign.findUnique({ where: { id }, select: { status: true } });
  if (!current) return { ok: false, error: NOT_FOUND };
  if (!TRANSITIONS[current.status].includes(status)) return { ok: false, error: "Это действие сейчас недоступно — обновите страницу" };
  // Условно по прежнему статусу: два админа не перепишут друг друга
  const { count } = await db.campaign.updateMany({ where: { id, status: current.status }, data: { status } });
  if (count === 0) return { ok: false, error: "Рассылку уже изменили — обновите страницу" };
  console.info(`[campaigns] ${me.login}: ${id} ${current.status} -> ${status}`);
  revalidatePath("/admin/campaigns");
  return { ok: true };
}

/** Только черновик (у отправленных есть история — их в архив). */
export async function deleteCampaignAction(id: string): Promise<Result> {
  const me = await requireCampaignAdmin();
  const { count } = await db.campaign.deleteMany({ where: { id, status: "DRAFT" } });
  if (count === 0) return { ok: false, error: "Удалить можно только черновик" };
  console.info(`[campaigns] ${me.login}: delete ${id}`);
  revalidatePath("/admin/campaigns");
  return { ok: true };
}

/** Уведомление админу самому: каналы кампании, без записи отправки. */
export async function testSendAction(id: string): Promise<Result> {
  const me = await requireCampaignAdmin();
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) return { ok: false, error: NOT_FOUND };
  await notify(db, me.id, { type: NotificationType.COMEBACK, title: c.title, body: c.body, url: c.url }, { push: true, channels: { push: c.push, telegram: c.telegram } });
  revalidatePath("/admin/campaigns");
  return { ok: true };
}

/** «Кто попадёт сейчас»: число подходящих игроков с флагом. */
export async function audienceAction(id: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireCampaignAdmin();
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) return { ok: false, error: NOT_FOUND };
  return { ok: true, count: await campaignAudience(c) };
}
