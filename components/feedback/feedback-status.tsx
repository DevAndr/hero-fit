import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type FeedbackStatus } from "@/lib/feedback/rules";

const VARIANT: Record<FeedbackStatus, "default" | "secondary" | "destructive" | "outline"> = {
  NEW: "outline",
  IN_PROGRESS: "secondary",
  DONE: "default",
  REJECTED: "destructive",
};

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
