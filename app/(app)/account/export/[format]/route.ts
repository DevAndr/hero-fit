import { getCurrentUser } from "@/lib/auth/dal";
import { toWorkoutsCsv } from "@/lib/account/csv";
import { buildExport } from "@/lib/account/export";
import { getCsvSets, getExportData } from "@/lib/account/export-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";

/** Выгрузка своих данных (152-ФЗ): `json` — всё, `csv` — подходы тренировок. Только себе, без кэша. */
export async function GET(_req: Request, { params }: RouteContext<"/account/export/[format]">) {
  const { format } = await params;
  if (format !== "json" && format !== "csv") return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const tz = safeTimeZone(user.timeZone);
  const now = new Date();
  const filename = `hero-fit-${user.login}-${dayKey(now, tz)}.${format}`;
  const body =
    format === "json"
      ? JSON.stringify(buildExport(await getExportData(user.id), now), null, 2)
      : toWorkoutsCsv(await getCsvSets(user.id), tz);
  return new Response(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
