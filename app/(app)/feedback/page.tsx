import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackList } from "@/components/feedback/feedback-list";
import { requireUser } from "@/lib/auth/dal";
import { getMyFeedback } from "@/lib/feedback/queries";

export const metadata: Metadata = { title: "Обратная связь" };

export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const user = await requireUser();
  const { from } = await searchParams;
  const items = await getMyFeedback(user.id);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Обратная связь" description="Нашли ошибку или есть идея? Напишите — мы читаем всё." />
      <FeedbackForm page={typeof from === "string" ? from : undefined} />
      <FeedbackList items={items} timeZone={user.timeZone} />
    </div>
  );
}
