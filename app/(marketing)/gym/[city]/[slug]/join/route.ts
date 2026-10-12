import { notFound, redirect } from "next/navigation";
import { queueGoal } from "@/lib/analytics/queue";
import { getCurrentUser } from "@/lib/auth/dal";
import { resolveClubPage } from "@/lib/club/public-queries";

/** «Вступить» со страницы клуба: цель Метрики, затем экран согласия (гостю — сначала регистрация). */
export async function GET(_req: Request, { params }: RouteContext<"/gym/[city]/[slug]/join">) {
  const { city, slug } = await params;
  const viewer = await getCurrentUser();
  const page = await resolveClubPage(city, slug, viewer);
  if (page?.access !== "open") notFound();
  await queueGoal("club_page_join");
  const join = `/clubs/join/${page.club.code}`;
  redirect(viewer ? join : `/register?next=${encodeURIComponent(join)}`);
}
