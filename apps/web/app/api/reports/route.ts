import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { submitReport, UserReportSchema } from "@/lib/reportsAdmin";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 47번 신고 `{ type: "user", ch | room, sid, reason, memo? }` 또는 `{ type: "megaphone", id, reason, memo? }`.
 * 같은 대상은 하루 한 번(409 ALREADY_REPORTED), 신고 전체는 묘비 신고와 같은 하루 한도를 함께 쓴다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const input = await readBody(req, UserReportSchema);
  await rateLimit("report", req, visitorId);
  await submitReport(visitorId, input);
  return json({ ok: true });
});
