/**
 * «Все данные» (JSON) — выгрузка по 152-ФЗ. Профиль собирается по белому списку: хэш пароля, Telegram id, токены сюда
 * не попадают, даже если пришли в выборке; о других людях — только ники.
 */

import { itemByCode } from "@/lib/shop/catalog";

type Dated = Date | null;
type ProgramRuleFields = { weeks: number; stepKind: string; stepValue: number; deloadEvery: number | null; deloadPct: number };
const ruleOf = (p: ProgramRuleFields) => ({ stepKind: p.stepKind, stepValue: p.stepValue, deloadEvery: p.deloadEvery, deloadPct: p.deloadPct });

export type ExportWorkout = {
  name: string;
  status: string;
  startedAt: Dated;
  finishedAt: Dated;
  durationSec: number | null;
  totalVolume: number;
  rpe: number | null;
  notes: string | null;
  wellbeing: string | null;
  exercises: { name: string; supersetGroup?: number | null; sets: { weight: number; reps: number; rir: number | null; isWarmup: boolean; completedAt: Dated; durationSec?: number | null; distanceM?: number | null }[] }[];
};

export type ExportRaw = {
  /** Строка пользователя — может содержать и секреты: профиль берёт только PROFILE_FIELDS и notify*. */
  user: Record<string, unknown> & { telegramChatId?: unknown; telegramId?: unknown };
  workouts: ExportWorkout[];
  /** Люди — могут прийти с лишними полями (id, логин): в выгрузку идут только ник и даты. */
  friends: ({ nickname: string | null; status: string; since: Dated } & Record<string, unknown>)[];
  coach: ({ nickname: string | null; since: Dated; until: Dated } & Record<string, unknown>)[];
  clients: ({ nickname: string | null; since: Dated; until: Dated } & Record<string, unknown>)[];
  exercises: unknown[];
  templates: unknown[];
  plans: unknown[];
  goals: unknown[];
  /** Замеры гибкости по целям-навыкам: навык (ключ или своё название), местный день, «см до цели». */
  stretchMeasurements: { skill: string; date: string; cm: number }[];
  /** Курс «Сесть на шпагат»: на входе с id/userId/goalId/remindedDay — в выгрузку идут без них. */
  stretchCourses: ({ skill: string; status: string; remindDays: number[]; nextSession: number; startedAt: Date; finishedAt: Dated } & Record<string, unknown>)[];
  bodyWeight: unknown[];
  records: unknown[];
  achievements: unknown[];
  xpHistory: unknown[];
  recaps: unknown[];
  boss: unknown[];
  goblins: unknown[];
  raids: unknown[];
  guild: unknown;
  club: unknown;
  coachComments: unknown[];
  /** Заметки тренеров обо мне и мои заметки о клиентах — с лишними полями (id) на входе: в выгрузку — текст, дата, ник. */
  coachNotesAboutMe: ({ text: string; updatedAt: Date; coach: string | null } & Record<string, unknown>)[];
  /** Итоги недели тренера: строка обо мне (я клиент) и мои снимки (я тренер) — ник вместо id. */
  coachRecapsAboutMe: ({ week: string; coach: string | null; data: unknown } & Record<string, unknown>)[];
  coachRecaps: ({ week: string; totals: unknown; clients: ({ client: string | null; data: unknown } & Record<string, unknown>)[] } & Record<string, unknown>)[];
  clientNotes: ({ text: string; updatedAt: Date; client: string | null } & Record<string, unknown>)[];
  /** Респекты 🏆 и кудосы 👊: дата тренировки (finishedAt), упражнение (у респекта) и ник — на входе могут быть id. */
  respectsGiven: ({ workoutDate: Dated; exercise: string; to: string | null } & Record<string, unknown>)[];
  respectsReceived: ({ workoutDate: Dated; exercise: string; from: string | null } & Record<string, unknown>)[];
  kudosGiven: ({ workoutDate: Dated; to: string | null } & Record<string, unknown>)[];
  kudosReceived: ({ workoutDate: Dated; from: string | null } & Record<string, unknown>)[];
  /** Совместные тренировки (принятые): дата, роль, ник партнёра, статус и бонус XP — без id. */
  trainingSessions: ({ date: Date; role: "позвал" | "позвали"; partner: string | null; status: string; bonusXp: number } & Record<string, unknown>)[];
  /** Сколько 👊 отправлено партнёрам во время совместных тренировок. */
  cheersSent: number;
  /** ★ Избранные упражнения: название и когда отмечено, без id. */
  favoriteExercises: ({ exercise: string; createdAt: Date } & Record<string, unknown>)[];
  /** Обращения в обратную связь — без заметки админа, браузера и id. */
  feedback: ({ kind: string; body: string; status: string; page: string | null; createdAt: Date } & Record<string, unknown>)[];
  /** Устройства с push: тип и версия приложения — без эндпоинта и ключей. */
  pushDevices: ({ kind: string; appVersion: string | null; createdAt: Date } & Record<string, unknown>)[];
  /** Отправки рассылок «вернуться»: название кампании и даты — без id и ключа серии. */
  campaignSends: ({ campaign: string; sentAt: Date; returnedAt: Dated } & Record<string, unknown>)[];
  /** Программы тренера, назначенные мне, и моя библиотека программ (тренер) — на входе с id, в выгрузку — без. */
  programs: (ProgramRuleFields & { name: string; startDate: string; endedAt: Dated; fromCatalog: boolean; catalogProgram: ({ name: string; author: string | null } & Record<string, unknown>) | null; bases: ({ template: string; exercise: string; weight: number; fromWeek: number } & Record<string, unknown>)[] } & Record<string, unknown>)[];
  coachPrograms: (ProgramRuleFields & { name: string; days: ({ weekday: number; template: string; time: string } & Record<string, unknown>)[] } & Record<string, unknown>)[];
  /** Опубликованные в каталоге программы тренера: число занимающихся — без людей; id и причина снятия сюда не идут. */
  publishedPrograms: ({ name: string; description: string | null; publishedAt: Date; hiddenAt: Dated; participants: number } & Record<string, unknown>)[];
  /** Публичная страница тренера: поля, контакты и согласие; открытия контактов — только число по дням (кто открывал, не хранится). */
  coachPage:
    | ({
        displayName: string | null;
        city: string | null;
        format: string;
        specialties: string[];
        about: string;
        publishedAt: Dated;
        catalogListed: boolean;
        joinEnabled: boolean;
        telegram: string | null;
        whatsapp: string | null;
        vk: string | null;
        phone: string | null;
        email: string | null;
        contactsConsentAt: Dated;
        contactOpens: ({ day: Date; count: number } & Record<string, unknown>)[];
      } & Record<string, unknown>)
    | null;
  notifications: unknown[];
  /** WHOOP: null без подключения. Токены не выбираются вовсе; активности — без userId. */
  whoop: { whoopUserId: string; connectedAt: Date; consentAt: Date; workouts: unknown[]; sleeps: unknown[] } | null;
  shop: {
    coins: number;
    items: { code: string; acquiredAt: Date }[];
    coinHistory: ({ amount: number; reason: string; createdAt: Date } & Record<string, unknown>)[];
  };
};

export const EXPORT_SECTIONS = [
  "profile",
  "workouts",
  "exercises",
  "templates",
  "plans",
  "goals",
  "stretchMeasurements",
  "stretchCourses",
  "bodyWeight",
  "records",
  "achievements",
  "xpHistory",
  "recaps",
  "boss",
  "goblins",
  "raids",
  "friends",
  "guild",
  "club",
  "coach",
  "clients",
  "coachComments",
  "coachNotesAboutMe",
  "clientNotes",
  "coachRecapsAboutMe",
  "coachRecaps",
  "respectsGiven",
  "respectsReceived",
  "kudosGiven",
  "kudosReceived",
  "trainingSessions",
  "cheersSent",
  "favoriteExercises",
  "feedback",
  "pushDevices",
  "campaignSends",
  "programs",
  "coachPrograms",
  "publishedPrograms",
  "coachPage",
  "notifications",
  "shop",
  "whoop",
] as const;

const PROFILE_FIELDS = [
  "login",
  "email",
  "name",
  "nickname",
  "timeZone",
  "gender",
  "heightCm",
  "birthYear",
  "activityLevel",
  "nutritionGoal",
  "createdAt",
  "privacyAcceptedAt",
  "signupLanding",
  "signupReferrer",
  "signupUtmSource",
  "signupUtmCampaign",
  "coachGuideHiddenAt",
  "xp",
  "level",
  "currentStreak",
  "longestStreak",
  "hideWeights",
  "shareActivity",
  "shareRecordCards",
] as const;

const people = <T extends { nickname: string | null }>(list: T[], keys: (keyof T)[]) =>
  list.map((p) => Object.fromEntries(keys.map((k) => [k, p[k]])) as Pick<T, (typeof keys)[number]>);

export function buildExport(raw: ExportRaw, exportedAt: Date) {
  const u = raw.user;
  const notifications = Object.fromEntries(Object.entries(u).filter(([k, v]) => /^notify[A-Z]/.test(k) && typeof v === "boolean"));
  return {
    version: 1 as const,
    exportedAt,
    profile: { ...Object.fromEntries(PROFILE_FIELDS.map((k) => [k, u[k] ?? null])), notifications, telegramLinked: u.telegramChatId != null || u.telegramId != null },
    workouts: raw.workouts.map((w) => ({
      name: w.name,
      status: w.status,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      durationSec: w.durationSec,
      totalVolume: w.totalVolume,
      rpe: w.rpe,
      notes: w.notes,
      wellbeing: w.wellbeing,
      exercises: w.exercises.map((e) => ({
        name: e.name,
        superset: e.supersetGroup ?? null,
        sets: e.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
          warmup: s.isWarmup,
          done: s.completedAt !== null,
          durationSec: s.durationSec ?? null,
          distanceM: s.distanceM ?? null,
        })),
      })),
    })),
    exercises: raw.exercises,
    templates: raw.templates,
    plans: raw.plans,
    goals: raw.goals,
    stretchMeasurements: raw.stretchMeasurements.map((m) => ({ skill: m.skill, date: m.date, cm: m.cm })),
    stretchCourses: raw.stretchCourses.map((c) => ({ skill: c.skill, status: c.status, remindDays: c.remindDays, nextSession: c.nextSession, startedAt: c.startedAt, finishedAt: c.finishedAt })),
    bodyWeight: raw.bodyWeight,
    records: raw.records,
    achievements: raw.achievements,
    xpHistory: raw.xpHistory,
    recaps: raw.recaps,
    boss: raw.boss,
    goblins: raw.goblins,
    raids: raw.raids,
    friends: people(raw.friends, ["nickname", "status", "since"]),
    guild: raw.guild,
    club: raw.club,
    coach: people(raw.coach, ["nickname", "since", "until"]),
    clients: people(raw.clients, ["nickname", "since", "until"]),
    coachComments: raw.coachComments,
    coachNotesAboutMe: raw.coachNotesAboutMe.map((n) => ({ text: n.text, updatedAt: n.updatedAt, coach: n.coach })),
    clientNotes: raw.clientNotes.map((n) => ({ text: n.text, updatedAt: n.updatedAt, client: n.client })),
    coachRecapsAboutMe: raw.coachRecapsAboutMe.map((r) => ({ week: r.week, coach: r.coach, data: r.data })),
    coachRecaps: raw.coachRecaps.map((r) => ({
      week: r.week,
      totals: r.totals,
      clients: r.clients.map((c) => ({ client: c.client, data: c.data })),
    })),
    respectsGiven: raw.respectsGiven.map((r) => ({ workoutDate: r.workoutDate, exercise: r.exercise, to: r.to })),
    respectsReceived: raw.respectsReceived.map((r) => ({ workoutDate: r.workoutDate, exercise: r.exercise, from: r.from })),
    kudosGiven: raw.kudosGiven.map((k) => ({ workoutDate: k.workoutDate, to: k.to })),
    kudosReceived: raw.kudosReceived.map((k) => ({ workoutDate: k.workoutDate, from: k.from })),
    trainingSessions: raw.trainingSessions.map((s) => ({ date: s.date, role: s.role, partner: s.partner, status: s.status, bonusXp: s.bonusXp })),
    cheersSent: raw.cheersSent,
    favoriteExercises: raw.favoriteExercises.map((f) => ({ exercise: f.exercise, createdAt: f.createdAt })),
    feedback: raw.feedback.map((f) => ({ kind: f.kind, body: f.body, status: f.status, page: f.page, createdAt: f.createdAt })),
    pushDevices: raw.pushDevices.map((d) => ({ kind: d.kind, appVersion: d.appVersion, createdAt: d.createdAt })),
    campaignSends: raw.campaignSends.map((s) => ({ campaign: s.campaign, sentAt: s.sentAt, returnedAt: s.returnedAt })),
    programs: raw.programs.map((p) => ({
      name: p.name,
      startDate: p.startDate,
      weeks: p.weeks,
      rule: ruleOf(p),
      ended: p.endedAt !== null,
      fromCatalog: p.fromCatalog,
      catalogProgram: p.catalogProgram ? { name: p.catalogProgram.name, author: p.catalogProgram.author } : null,
      bases: p.bases.map((b) => ({ template: b.template, exercise: b.exercise, weight: b.weight, fromWeek: b.fromWeek })),
    })),
    coachPrograms: raw.coachPrograms.map((p) => ({
      name: p.name,
      weeks: p.weeks,
      rule: ruleOf(p),
      days: p.days.map((d) => ({ weekday: d.weekday, template: d.template, time: d.time })),
    })),
    publishedPrograms: raw.publishedPrograms.map((p) => ({ name: p.name, description: p.description, publishedAt: p.publishedAt, hiddenAt: p.hiddenAt, participants: p.participants })),
    coachPage: raw.coachPage
      ? {
          displayName: raw.coachPage.displayName,
          city: raw.coachPage.city,
          format: raw.coachPage.format,
          specialties: raw.coachPage.specialties,
          about: raw.coachPage.about,
          publishedAt: raw.coachPage.publishedAt,
          catalogListed: raw.coachPage.catalogListed,
          joinEnabled: raw.coachPage.joinEnabled,
          contacts: {
            telegram: raw.coachPage.telegram,
            whatsapp: raw.coachPage.whatsapp,
            vk: raw.coachPage.vk,
            phone: raw.coachPage.phone,
            email: raw.coachPage.email,
          },
          contactsConsentAt: raw.coachPage.contactsConsentAt,
          contactOpens: raw.coachPage.contactOpens.map((c) => ({ day: c.day, count: c.count })),
        }
      : null,
    notifications: raw.notifications,
    shop: {
      coins: raw.shop.coins,
      items: raw.shop.items.map((i) => ({ code: i.code, name: itemByCode(i.code)?.name ?? i.code, acquiredAt: i.acquiredAt })),
      coinHistory: raw.shop.coinHistory.map((c) => ({ amount: c.amount, reason: c.reason, createdAt: c.createdAt })),
    },
    whoop: raw.whoop,
  };
}

export type ExportV1 = ReturnType<typeof buildExport>;
