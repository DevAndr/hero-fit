"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { CLUBS_OFF, clubsAllowed } from "@/lib/club/access";
import { aboutSchema, canPublish, CLUB_ABOUT_MIN, clubPath, slugCandidates, slugify } from "@/lib/club/public";
import { adminCounts, citySuggestions, findSimilar, getClubFeed } from "@/lib/club/queries";
import { clubEditSchema, clubKey, clubSchema, createBlock, joinBlock, kickBlock, transferBlock } from "@/lib/club/rules";
import { queueGoal } from "@/lib/analytics/queue";
import { notify } from "@/lib/notifications/service";
import { generateFriendCode, nicknameKey } from "@/lib/social/league";

type Result = { ok: true; id?: string } | { ok: false; error: string };
type Tx = Prisma.TransactionClient;

const NOT_FOUND = "Клуб не найден";
const UNAVAILABLE = "Клуб недоступен";
const NOT_ADMIN = "Это может только админ клуба";

/**
 * Блокировки до конца транзакции. Порядок везде один — сначала строки пользователей, потом строка клуба, —
 * чтобы встречные действия ждали друг друга, а не взаимоблокировались.
 */
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

async function lockClub(tx: Tx, clubId: string) {
  const [club] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM "Club" WHERE id = ${clubId} FOR UPDATE`;
  return club ?? null;
}

/** Пользователь с флагом `clubs`; без флага — null (действие отказывает). */
async function clubUser() {
  const user = await requireUser();
  return (await clubsAllowed(user.id)) ? user : null;
}

const firstError = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Проверьте поля";

/** Новый код приглашения; совпадение с чужим — следующая попытка. */
async function freshCode(client: Tx | typeof db) {
  for (let i = 0; i < 5; i++) {
    const code = generateFriendCode();
    if (!(await client.club.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Не удалось создать код клуба");
}

const keys = (d: { name: string; city: string; address: string }) => ({
  nameKey: clubKey(d.name),
  cityKey: clubKey(d.city),
  addressKey: clubKey(d.address),
});

/** Заявка на клуб: на проверку админу приложения, заявитель — админ клуба. */
export async function createClubAction(input: unknown): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  const parsed = clubSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { name, city, address, contact } = parsed.data;
  // Лимиты — под блокировкой строки заявителя: две заявки разом не обойдут их
  const result = await db.$transaction(async (tx): Promise<{ error: string } | { id: string }> => {
    await lockUser(tx, user.id);
    const block = createBlock(await adminCounts(user.id, tx));
    if (block) return { error: block };
    const club = await tx.club.create({
      data: { name, city, address, contact, ...keys(parsed.data), code: await freshCode(tx), adminId: user.id },
      select: { id: true },
    });
    return { id: club.id };
  });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/clubs");
  return { ok: true, id: result.id };
}

/** «Возможно, ваш зал уже есть» — для формы заявки. */
export async function findSimilarAction(input: { city: string; name: string; address: string }) {
  if (!(await clubUser())) return [];
  const clean = { city: String(input.city ?? ""), name: String(input.name ?? ""), address: String(input.address ?? "") };
  if (!clubKey(clean.city) || (!clubKey(clean.name) && !clubKey(clean.address))) return [];
  return (await findSimilar(clean)).map(({ id, name, address }) => ({ id, name, address }));
}

export async function citySuggestionsAction(prefix: string): Promise<string[]> {
  if (!(await clubUser())) return [];
  return citySuggestions(String(prefix ?? "").slice(0, 40));
}

/** Вступить: сразу; прежний клуб покидается. Статус и бан — под блокировкой строки клуба. */
export async function joinClubAction(clubId: string): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } });
  const error = await db.$transaction(async (tx) => {
    // Строка пользователя — две вкладки со вступлением в разные клубы идут по очереди (иначе P2002 и 500)
    await lockUser(tx, user.id);
    const club = await lockClub(tx, String(clubId));
    if (!club) return NOT_FOUND;
    if (club.status !== "APPROVED") return UNAVAILABLE;
    const banned = await tx.clubBan.findUnique({ where: { clubId_userId: { clubId, userId: user.id } }, select: { userId: true } });
    const current = await tx.clubMember.findUnique({ where: { userId: user.id }, select: { clubId: true } });
    const block = joinBlock({ banned: Boolean(banned), hasNickname: Boolean(me.nickname), sameClub: current?.clubId === clubId });
    if (block === "same") return null;
    if (block === "nickname") return "Нужен ник";
    if (block) return block;
    await tx.clubMember.deleteMany({ where: { userId: user.id } });
    await tx.clubMember.create({ data: { userId: user.id, clubId } });
    return null;
  });
  if (error) return { ok: false, error };
  revalidatePath("/clubs", "layout");
  return { ok: true, id: clubId };
}

export async function leaveClubAction(): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  await db.clubMember.deleteMany({ where: { userId: user.id } });
  revalidatePath("/clubs", "layout");
  return { ok: true };
}

/** Клуб, которым я управляю (или любой — админу приложения). */
async function managed(clubId: string, user: { id: string; isAdmin: boolean }) {
  const club = await db.club.findUnique({ where: { id: String(clubId) }, select: { id: true, name: true, adminId: true } });
  if (!club || (club.adminId !== user.id && !user.isAdmin)) return null;
  return club;
}

/** Правка названия, города, адреса — у одобренного применяется сразу. Админу приложения — без флага. */
export async function updateClubAction(clubId: string, input: unknown): Promise<Result> {
  const user = await requireUser();
  if (!user.isAdmin && !(await clubsAllowed(user.id))) return { ok: false, error: CLUBS_OFF };
  const club = await managed(clubId, user);
  if (!club) return { ok: false, error: NOT_ADMIN };
  const parsed = clubEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  await db.club.update({ where: { id: club.id }, data: { ...parsed.data, ...keys(parsed.data) } });
  revalidatePath("/clubs", "layout");
  revalidatePath("/admin/clubs");
  return { ok: true };
}

/** Исключить участника — с блокировкой повторного вступления. */
export async function kickClubMemberAction(clubId: string, userId: string): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  const club = await managed(clubId, { id: user.id, isAdmin: false });
  if (!club) return { ok: false, error: NOT_ADMIN };
  const block = kickBlock({ adminId: club.adminId, targetId: String(userId) });
  if (block) return { ok: false, error: block };
  await db.$transaction(async (tx) => {
    // Та же блокировка строки клуба, что во вступлении: вступление после бана увидит бан
    await lockClub(tx, club.id);
    const removed = await tx.clubMember.deleteMany({ where: { userId, clubId: club.id } });
    await tx.clubBan.upsert({ where: { clubId_userId: { clubId: club.id, userId } }, create: { clubId: club.id, userId }, update: {} });
    if (removed.count > 0) {
      await notify(tx, userId, { type: NotificationType.SOCIAL, title: `Вас исключили из клуба «${club.name}»`, body: club.name, url: "/clubs" }, { push: false });
    }
  });
  revalidatePath("/clubs", "layout");
  return { ok: true };
}

export async function unbanClubMemberAction(clubId: string, userId: string): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  const club = await managed(clubId, { id: user.id, isAdmin: false });
  if (!club) return { ok: false, error: NOT_ADMIN };
  await db.clubBan.deleteMany({ where: { clubId: club.id, userId: String(userId) } });
  revalidatePath(`/clubs/${club.id}/manage`);
  return { ok: true };
}

/** Передать клуб участнику по нику. */
export async function transferClubAction(clubId: string, nickname: string): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  const club = await managed(clubId, { id: user.id, isAdmin: false });
  if (!club) return { ok: false, error: NOT_ADMIN };
  const found = await db.user.findFirst({ where: { nicknameKey: nicknameKey(String(nickname ?? "")) }, select: { id: true } });
  if (!found) return { ok: false, error: "Нет участника с таким ником" };
  const result = await db.$transaction(async (tx) => {
    // Под блокировкой строки нового админа: его лимит клубов и членство не изменятся до конца передачи
    await lockUser(tx, found.id);
    const target = await tx.user.findUniqueOrThrow({ where: { id: found.id }, select: { id: true, clubMember: { select: { clubId: true } } } });
    const block = transferBlock({
      selfId: user.id,
      targetId: target.id,
      targetIsMember: target.clubMember?.clubId === club.id,
      targetAdmined: (await adminCounts(target.id, tx)).admined,
    });
    if (block) return block;
    const { count } = await tx.club.updateMany({ where: { id: club.id, adminId: user.id }, data: { adminId: target.id } });
    if (count === 1) {
      await notify(
        tx,
        target.id,
        { type: NotificationType.SOCIAL, title: `Вы теперь админ клуба «${club.name}»`, body: club.name, url: `/clubs/${club.id}/manage` },
        { push: true },
      );
    }
    return count === 1 ? null : NOT_ADMIN;
  });
  if (result) return { ok: false, error: result };
  revalidatePath("/clubs", "layout");
  return { ok: true };
}

/** Новая ссылка-приглашение; старая перестаёт работать. */
export async function regenerateClubCodeAction(clubId: string): Promise<Result> {
  const user = await clubUser();
  if (!user) return { ok: false, error: CLUBS_OFF };
  const club = await managed(clubId, { id: user.id, isAdmin: false });
  if (!club) return { ok: false, error: NOT_ADMIN };
  await db.club.update({ where: { id: club.id }, data: { code: await freshCode(db) } });
  revalidatePath(`/clubs/${club.id}`, "layout");
  return { ok: true };
}

/** Подгрузка ленты клуба — только участнику. */
export async function loadClubFeedAction(clubId: string, cursor: string) {
  const user = await clubUser();
  if (!user) return { events: [], next: null };
  const member = await db.clubMember.findFirst({ where: { userId: user.id, clubId: String(clubId) }, select: { userId: true } });
  if (!member) return { events: [], next: null };
  return getClubFeed(String(clubId), user.id, String(cursor));
}

/** Админ клуба с флагом — для публичной страницы (страница — витрина клуба, не модерация). */
async function publicPageClub(clubId: string) {
  const user = await clubUser();
  if (!user) return { ok: false as const, error: CLUBS_OFF };
  const club = await db.club.findUnique({
    where: { id: String(clubId) },
    select: { id: true, name: true, city: true, address: true, about: true, status: true, adminId: true, slug: true, citySlug: true, publishedAt: true },
  });
  if (!club || club.adminId !== user.id) return { ok: false as const, error: NOT_ADMIN };
  return { ok: true as const, club };
}

function revalidatePublicPage(c: { id: string; slug: string | null; citySlug: string | null }) {
  revalidatePath(`/clubs/${c.id}/manage`);
  if (c.slug && c.citySlug) revalidatePath(clubPath(c.citySlug, c.slug));
}

/** «О зале»: у опубликованной страницы пустым или коротким не сохраняется — сначала снять с публикации. */
export async function saveClubAboutAction(clubId: string, about: string): Promise<Result> {
  const r = await publicPageClub(clubId);
  if (!r.ok) return r;
  const parsed = aboutSchema.safeParse(about);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (r.club.publishedAt && parsed.data.length < CLUB_ABOUT_MIN) return { ok: false, error: "Чтобы убрать текст, снимите страницу с публикации" };
  await db.club.update({ where: { id: r.club.id }, data: { about: parsed.data } });
  revalidatePublicPage(r.club);
  return { ok: true };
}

/** Публикация: адрес выбирается при первой публикации и больше не меняется. */
export async function publishClubPageAction(clubId: string): Promise<Result & { path?: string }> {
  const r = await publishPage(clubId);
  if (r.ok) await queueGoal("club_page_published");
  return r;
}

async function publishPage(clubId: string): Promise<Result & { path?: string }> {
  const r = await publicPageClub(clubId);
  if (!r.ok) return r;
  const { club } = r;
  const block = canPublish(club);
  if (block) return { ok: false, error: block };
  if (club.slug && club.citySlug) {
    await db.club.update({ where: { id: club.id }, data: { publishedAt: new Date() } });
    revalidatePublicPage(club);
    return { ok: true, path: clubPath(club.citySlug, club.slug) };
  }
  const citySlug = slugify(club.city, "city");
  for (const slug of slugCandidates(club.name, club.address)) {
    try {
      // Условие slug = null: параллельная публикация не перепишет уже выбранный адрес
      const { count } = await db.club.updateMany({ where: { id: club.id, slug: null }, data: { slug, citySlug, publishedAt: new Date() } });
      if (!count) return publishPage(clubId);
      revalidatePublicPage({ id: club.id, slug, citySlug });
      return { ok: true, path: clubPath(citySlug, slug) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "Не удалось подобрать адрес, напишите нам" };
}

/** Снять с публикации: адрес остаётся за клубом. */
export async function unpublishClubPageAction(clubId: string): Promise<Result> {
  const r = await publicPageClub(clubId);
  if (!r.ok) return r;
  await db.club.update({ where: { id: r.club.id }, data: { publishedAt: null } });
  revalidatePublicPage(r.club);
  return { ok: true };
}
