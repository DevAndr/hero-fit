import { notFound, redirect } from "next/navigation";
import { queueGoal } from "@/lib/analytics/queue";
import { getCurrentUser } from "@/lib/auth/dal";
import { getPublicCoach } from "@/lib/coach/profile-queries";
import { ensureCoachCode } from "@/lib/coach/queries";

/** «Заниматься» со страницы тренера: цель Метрики, затем экран согласия (гостю — сначала регистрация). */
export async function GET(_req: Request, { params }: RouteContext<"/trainer/[nick]/join">) {
  const { nick } = await params;
  const coach = await getPublicCoach(nick);
  if (!coach?.profile.publishedAt) notFound();
  const code = coach.coachCode ?? (await ensureCoachCode(coach.id));
  await queueGoal("trainer_page_join");
  const join = `/coach/join/${code}`;
  redirect((await getCurrentUser()) ? join : `/register?next=${encodeURIComponent(join)}`);
}
