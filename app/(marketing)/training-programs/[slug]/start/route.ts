import { notFound, redirect } from "next/navigation";
import { queueGoal } from "@/lib/analytics/queue";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { programBySlug } from "@/lib/programs/builtin";
import { createPlannedWorkout } from "@/lib/workouts/create";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";

/** Возврат сюда после входа или регистрации (`?next=`): нажатие уже посчитано до них. */
function afterAuth(req: Request) {
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.origin === new URL(req.url).origin && (url.pathname === "/register" || url.pathname === "/login");
  } catch {
    return false;
  }
}

/** «Начать программу» с публичной страницы: цель Метрики, гостю — регистрация, вошедшему — первый день в редакторе. */
export async function GET(req: Request, { params }: RouteContext<"/training-programs/[slug]/start">) {
  const { slug } = await params;
  const p = programBySlug(slug);
  if (!p) notFound();
  // RSC-запрос — redirect(next) из server action регистрации: Next запрашивает цель сам и, пройдя наш 307, оставил бы
  // в адресной строке «…/start» с содержимым /training. Без RSC-ответа клиент делает обычный переход — тогда и создаём.
  if (req.headers.get("rsc")) return new Response(null, { status: 204 });
  if (!afterAuth(req)) await queueGoal("program_start");
  const user = await getCurrentUser();
  if (!user) redirect(`/register?next=${encodeURIComponent(`/training-programs/${slug}/start`)}`);

  // Идущая или собранная тренировка — не плодим вторую, ведём к ней
  const active = await db.workout.findFirst({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
  if (active) redirect("/training");

  const template = await db.workoutTemplate.findFirst({
    where: { userId: null, program: p.program, name: p.days[0].name },
    select: { id: true },
  });
  if (template) await createPlannedWorkout(user.id, `template:${template.id}`);
  redirect("/training");
}
