import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ClubStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { collectEvents, type ClubFeedRow } from "@/lib/club/feed";
import { clubPath } from "@/lib/club/public";
import { CITY_SUGGESTIONS, CLUB_RATING_TOP, CLUB_SEARCH_LIMIT, clubKey, likePattern, similarClubs, type SimilarCandidate } from "@/lib/club/rules";
import { decodeCursor, encodeCursor } from "@/lib/social/feed";
import { normalizeFriendCode, rankLeague, type RankedMember } from "@/lib/social/league";
import { FEED_PAGE, LEAGUE_REASONS, weekBounds } from "@/lib/social/queries";
import { cosmeticsLoader } from "@/lib/shop/cosmetics-loader";
import { titleLabel } from "@/lib/titles/catalog";

export type ClubCard = { id: string; name: string; city: string; address: string; members: number };

/** Поиск одобренных клубов: город — по ключу (пусто — все), текст — по названию и адресу; крупные сверху. */
export async function searchClubs(city: string, text: string): Promise<ClubCard[]> {
  const cityKey = clubKey(city);
  const textKey = clubKey(text);
  return db.$queryRaw<ClubCard[]>`
    SELECT c.id, c.name, c.city, c.address, (SELECT COUNT(*) FROM "ClubMember" m WHERE m."clubId" = c.id)::int AS members
    FROM "Club" c
    WHERE c.status = 'APPROVED'
      ${cityKey ? Prisma.sql`AND c."cityKey" = ${cityKey}` : Prisma.empty}
      ${textKey ? Prisma.sql`AND (c."nameKey" ILIKE ${likePattern(textKey)} ESCAPE '\\' OR c."addressKey" ILIKE ${likePattern(textKey)} ESCAPE '\\')` : Prisma.empty}
    ORDER BY members DESC, c.name
    LIMIT ${CLUB_SEARCH_LIMIT}
  `;
}

/** Города одобренных клубов по началу названия. */
export async function citySuggestions(prefix: string): Promise<string[]> {
  const key = clubKey(prefix);
  if (!key) return [];
  const rows = await db.club.findMany({
    where: { status: "APPROVED", cityKey: { startsWith: key } },
    select: { city: true, cityKey: true },
    distinct: ["cityKey"],
    orderBy: { cityKey: "asc" },
    take: CITY_SUGGESTIONS,
  });
  return rows.map((r) => r.city);
}

const memberCount = { select: { members: true } } as const;

export type ClubPage = ClubCard & {
  status: ClubStatus;
  rejectReason: string | null;
  /** Ссылка-приглашение — только участнику и админу клуба. */
  code: string | null;
  isAdmin: boolean;
  isMember: boolean;
  banned: boolean;
};

/** Клуб для страницы и экрана вступления; видимость по статусу решает страница. */
export async function getClubPage(clubId: string, viewerId: string): Promise<ClubPage | null> {
  const club = await db.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      status: true,
      rejectReason: true,
      code: true,
      adminId: true,
      _count: memberCount,
      members: { where: { userId: viewerId }, select: { userId: true } },
      bans: { where: { userId: viewerId }, select: { userId: true } },
    },
  });
  if (!club) return null;
  const isAdmin = club.adminId === viewerId;
  const isMember = club.members.length > 0;
  return {
    id: club.id,
    name: club.name,
    city: club.city,
    address: club.address,
    members: club._count.members,
    status: club.status,
    rejectReason: club.rejectReason,
    code: isAdmin || isMember ? club.code : null,
    isAdmin,
    isMember,
    banned: club.bans.length > 0,
  };
}

/** Одобренный клуб по ссылке-приглашению. */
export async function getClubByCode(input: string): Promise<ClubCard | null> {
  const code = normalizeFriendCode(input);
  if (!code) return null;
  const club = await db.club.findFirst({
    where: { code, status: "APPROVED" },
    select: { id: true, name: true, city: true, address: true, _count: memberCount },
  });
  return club && { id: club.id, name: club.name, city: club.city, address: club.address, members: club._count.members };
}

/** Мой клуб (если есть) — для экрана вступления и переадресации `/clubs`. */
export async function getMyMembership(userId: string) {
  const m = await db.clubMember.findUnique({ where: { userId }, select: { club: { select: { id: true, name: true } } } });
  return m?.club ?? null;
}

const monthBounds = (timeZone: string) => Prisma.sql`
  SELECT date_trunc('month', now() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone} AS start_at,
         (date_trunc('month', now() AT TIME ZONE ${timeZone}) + interval '1 month') AT TIME ZONE ${timeZone} AS end_at
`;

export type ClubRating = { members: RankedMember[]; idle: number; total: number };

/**
 * Рейтинг клуба — очки как в лиге (XP за тренировки и рекорды) за неделю или месяц в поясе смотрящего; опыт до
 * вступления тоже считается. Нули — числом `idle`. Топ-50 и моя строка; не участнику — `top` строк.
 */
export async function getClubRating(clubId: string, viewerId: string, timeZone: string, period: "week" | "month", top = CLUB_RATING_TOP): Promise<ClubRating> {
  const rows = await db.$queryRaw<{ id: string; nickname: string; titleCode: string | null; avatarCode: string | null; frameCode: string | null; nickColorCode: string | null; level: number; xp: number; workouts: number }[]>`
    WITH b AS (${period === "week" ? weekBounds(timeZone, 0) : monthBounds(timeZone)})
    SELECT u.id, COALESCE(u.nickname, '') AS nickname, u."titleCode", u."avatarCode", u."frameCode", u."nickColorCode", u.level,
           COALESCE((
             SELECT SUM(x.amount) FROM "XpEvent" x
             WHERE x."userId" = u.id AND x.reason::text IN ${LEAGUE_REASONS}
               AND (x."createdAt" AT TIME ZONE 'UTC') >= b.start_at AND (x."createdAt" AT TIME ZONE 'UTC') < b.end_at
           ), 0)::int AS xp,
           (
             SELECT COUNT(*) FROM "Workout" w
             WHERE w."userId" = u.id AND w.status = 'COMPLETED'
               AND (w."finishedAt" AT TIME ZONE 'UTC') >= b.start_at AND (w."finishedAt" AT TIME ZONE 'UTC') < b.end_at
           )::int AS workouts
    FROM "ClubMember" m JOIN "User" u ON u.id = m."userId", b
    WHERE m."clubId" = ${clubId}
  `;
  const active = rows.filter((r) => r.xp > 0);
  const cosmetics = await cosmeticsLoader();
  const ranked = rankLeague(
    active.map(({ titleCode, avatarCode, frameCode, nickColorCode, ...r }) => ({
      ...r,
      title: titleLabel(titleCode),
      cosmetics: cosmetics({ id: r.id, avatarCode, frameCode, nickColorCode }),
      streak: 0,
    })),
    viewerId,
  );
  const shown = ranked.slice(0, top);
  const mine = ranked.find((m) => m.me);
  if (mine && !shown.includes(mine) && top === CLUB_RATING_TOP) shown.push(mine);
  return { members: shown, idle: rows.length - active.length, total: rows.length };
}

/**
 * Лента клуба: события тренировок участников после вступления; автор делится тренировками (или это я).
 * Только поля для событий — название, упражнения и объём не выбираются.
 */
export async function getClubFeed(clubId: string, viewerId: string, cursor: string | null) {
  const page = async (c: string | null) => {
    const after = decodeCursor(c);
    const rows = await db.$queryRaw<ClubFeedRow[]>`
      SELECT w.id, w."userId", u.nickname, u."titleCode", u."avatarCode", u."frameCode", u."nickColorCode", u."hideWeights", w."finishedAt", x.meta
      FROM "ClubMember" m
      JOIN "Workout" w ON w."userId" = m."userId"
      JOIN "User" u ON u.id = m."userId"
      LEFT JOIN "XpEvent" x ON x."workoutId" = w.id AND x.reason IN ('WORKOUT_COMPLETED', 'STRETCH_SESSION')
      WHERE m."clubId" = ${clubId}
        AND w.status = 'COMPLETED' AND w."finishedAt" IS NOT NULL AND w."finishedAt" >= m."joinedAt"
        AND (u."shareActivity" OR u.id = ${viewerId})
        ${after ? Prisma.sql`AND (w."finishedAt", w.id) < (${after.at}, ${after.id})` : Prisma.empty}
      ORDER BY w."finishedAt" DESC, w.id DESC
      LIMIT ${FEED_PAGE + 1}
    `;
    const cosmetics = await cosmeticsLoader();
    const shown = rows.slice(0, FEED_PAGE).map((r) => ({ ...r, cosmetics: cosmetics({ ...r, id: r.userId }) }));
    const last = shown.at(-1);
    return { rows: shown, next: rows.length > FEED_PAGE && last ? encodeCursor({ finishedAt: last.finishedAt.toISOString(), id: last.id }) : null };
  };
  return collectEvents(page, viewerId, cursor, FEED_PAGE);
}

export type MyClubs = {
  admin: (ClubCard & { status: ClubStatus; rejectReason: string | null })[];
  member: { id: string; name: string } | null;
};

/** Клубы, где я админ (заявки со статусами), и моё членство. */
export async function getMyClubs(userId: string): Promise<MyClubs> {
  const [admin, member] = await Promise.all([
    db.club.findMany({
      where: { adminId: userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, city: true, address: true, status: true, rejectReason: true, _count: memberCount },
    }),
    getMyMembership(userId),
  ]);
  return { admin: admin.map(({ _count, ...c }) => ({ ...c, members: _count.members })), member };
}

/** Счётчики для лимитов заявок; в транзакции — передать её клиент. */
export async function adminCounts(userId: string, client: Pick<typeof db, "club"> = db) {
  const rows = await client.club.groupBy({ by: ["status"], where: { adminId: userId }, _count: true });
  const count = (s: ClubStatus) => rows.find((r) => r.status === s)?._count ?? 0;
  return { admined: count("PENDING") + count("APPROVED") + count("HIDDEN"), pending: count("PENDING") };
}

/**
 * Похожие на заявку клубы того же города. Заявителю — только одобренные (чужие заявки на проверке не раскрываются,
 * а их страницы ему 404); модератору — и заявки на проверке.
 */
export async function findSimilar(
  input: { city: string; name: string; address: string },
  { exceptId, withPending = false }: { exceptId?: string; withPending?: boolean } = {},
): Promise<SimilarCandidate[]> {
  const clubs = await db.club.findMany({
    where: { cityKey: clubKey(input.city), status: { in: withPending ? ["APPROVED", "PENDING"] : ["APPROVED"] }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true, address: true, cityKey: true, nameKey: true, addressKey: true },
    take: 500,
  });
  return similarClubs(input, clubs);
}

/** Управление клубом: только его админ. */
export async function getClubManage(clubId: string, adminId: string) {
  const club = await db.club.findFirst({
    where: { id: clubId, adminId },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      status: true,
      code: true,
      about: true,
      slug: true,
      citySlug: true,
      publishedAt: true,
      members: { orderBy: { joinedAt: "asc" }, select: { joinedAt: true, user: { select: { id: true, nickname: true } } } },
      bans: { orderBy: { createdAt: "desc" }, select: { user: { select: { id: true, nickname: true } } } },
    },
  });
  if (!club) return null;
  return {
    club: { id: club.id, name: club.name, city: club.city, address: club.address, status: club.status, code: club.code },
    page: { about: club.about, slug: club.slug, citySlug: club.citySlug, published: Boolean(club.publishedAt) },
    members: club.members.map((m) => ({ id: m.user.id, nickname: m.user.nickname ?? "—", joinedAt: m.joinedAt.toISOString() })),
    banned: club.bans.map((b) => ({ id: b.user.id, nickname: b.user.nickname ?? "—" })),
  };
}

export type ClubManage = NonNullable<Awaited<ReturnType<typeof getClubManage>>>;

/** Заявок на проверке — для пункта меню админа приложения. */
export function pendingClubCount(): Promise<number> {
  return db.club.count({ where: { status: "PENDING" } });
}

export type ReviewClub = {
  id: string;
  name: string;
  city: string;
  address: string;
  contact: string;
  status: ClubStatus;
  members: number;
  createdAt: string;
  applicant: { login: string; nickname: string | null };
  similar: { id: string; name: string; address: string }[];
  /** «О зале» и адрес опубликованной страницы (null — не опубликована). */
  about: string;
  pagePath: string | null;
};

/** Модерация: на проверке (старые первыми, с похожими) или одобренные и скрытые; поиск по названию, городу, адресу. */
export async function getClubsForReview(tab: "pending" | "approved", search: string): Promise<ReviewClub[]> {
  const q = clubKey(search);
  const clubs = await db.club.findMany({
    // Поиск — в обеих вкладках: в длинной очереди нужную заявку иначе не найти (показываются 100 самых старых)
    where: {
      status: tab === "pending" ? "PENDING" : { in: ["APPROVED", "HIDDEN"] },
      ...(q ? { OR: [{ nameKey: { contains: q } }, { cityKey: { contains: q } }, { addressKey: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: tab === "pending" ? "asc" : "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      contact: true,
      status: true,
      createdAt: true,
      _count: memberCount,
      admin: { select: { login: true, nickname: true } },
      about: true,
      slug: true,
      citySlug: true,
      publishedAt: true,
    },
  });
  return Promise.all(
    clubs.map(async (c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      address: c.address,
      contact: c.contact,
      status: c.status,
      members: c._count.members,
      createdAt: c.createdAt.toISOString(),
      applicant: c.admin,
      about: c.about,
      // Ссылка и «Снять с публикации» — только у одобренного: страница скрытого и так 404
      pagePath: c.status === "APPROVED" && c.publishedAt && c.slug && c.citySlug ? clubPath(c.citySlug, c.slug) : null,
      similar: tab === "pending" ? (await findSimilar(c, { exceptId: c.id, withPending: true })).map(({ id, name, address }) => ({ id, name, address })) : [],
    })),
  );
}
