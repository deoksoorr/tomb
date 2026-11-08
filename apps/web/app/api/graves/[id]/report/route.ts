import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";
import { findVisible, getStore } from "@/lib/store";
import type { ReportResponse } from "@/lib/types";
import { readBody, ReportRequestSchema } from "@/lib/validate";

/** 신고 `{ reason? }`. 방문자당·IP당 1회, 서로 다른 IP 5곳에서 신고하면 목록에서 숨긴다 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  const { reason } = await readBody(req, ReportRequestSchema);
  await rateLimit("report", req, visitorId);
  const store = getStore();
  await findVisible(store, id);
  const result = await store.report(id, visitorId, ipHash(req), reason);
  if (result === null) throw notFound();
  if (result === "duplicate") throw new HttpError(409, "ALREADY_REPORTED", "이미 신고한 묘비예요.");
  return json<ReportResponse>({ ok: true });
});
