import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { reporterOf } from "@/lib/reportTrust";
import { requireVisitor } from "@/lib/session";
import { findVisible, getStore } from "@/lib/store";
import type { ReportResponse } from "@/lib/types";
import { readBody, ReportRequestSchema } from "@/lib/validate";

/**
 * 신고 `{ reason? }`. 계정당 1회, 서로 다른 계정 5명이 신고하면 목록에서 숨긴다 (11/18 IP가 아니라 계정 단위 — 같은 회사·집 여럿도 각자 센다).
 * 신고 기록에 신고한 사람(계정 코드·캐릭터 이름)이 남아 관리자 신고함에 보인다.
 * 만든 지 3일이 안 된 계정의 신고는 관리자 신고함에만 남고 숨김 수에는 안 들어간다 (lib/reportTrust)
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  const { reason } = await readBody(req, ReportRequestSchema);
  await rateLimit("report", req, visitorId);
  const store = getStore();
  await findVisible(store, id);
  const now = Date.now();
  const who = await reporterOf(visitorId, now);
  const result = await store.report(id, visitorId, reason, now, !who.trusted, who.by);
  if (result === null) throw notFound();
  if (result === "duplicate") throw new HttpError(409, "ALREADY_REPORTED", "이미 신고한 묘비예요.");
  return json<ReportResponse>({ ok: true });
});
