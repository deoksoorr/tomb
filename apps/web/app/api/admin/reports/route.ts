import { adminActor } from "@/lib/ban";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { actOnReport, listReports, ReportActionSchema, type AdminReport } from "@/lib/reportsAdmin";
import type { Resolution } from "@/lib/store/reportBox";
import { readBody } from "@/lib/validate";

export type AdminReportsResponse = { reports: AdminReport[]; openCount: number };
export type AdminReportActionResponse = { resolution: Resolution; expelled?: number | null };

/** 47번 신고 탭: `?status=open`(처리 대기, 기본) | `done`(처리됨). 묘비·방명록·유저·확성기 신고를 한 목록으로 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const status = req.nextUrl.searchParams.get("status") === "done" ? "done" : "open";
  return json<AdminReportsResponse>(await listReports(status));
});

/** 바로 처리 `{ key, action: hide | delete | kick | dismiss | resolve, note? }` → 처리됨으로 옮기고 처리 기록을 남긴다 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { key, action, note } = await readBody(req, ReportActionSchema);
  return json<AdminReportActionResponse>(await actOnReport(key, action, await adminActor(req), note));
});
