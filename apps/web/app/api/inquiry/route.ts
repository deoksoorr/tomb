import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import { assertNotBanned } from "@/lib/ban";
import { handler, HttpError, json } from "@/lib/http";
import { createInquiryIssue, inquiryInfo } from "@/lib/inquiry";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { getInquiries, type InquiryRecord } from "@/lib/store/inquiries";
import type { InquiryInfoResponse, InquiryResponse } from "@/lib/types";
import { InquirySchema, readBody } from "@/lib/validate";

/**
 * 문의를 받을 수 있는지와 GitHub으로도 보내는 저장소가 공개인지 (공개면 문의가 공개된다는 안내를 UI가 띄운다).
 * 11/20 signedIn: 게임 계정 쿠키가 있는지 (개발자 노트가 손님이면 연락처를 필수로 보여 준다)
 */
export const GET = handler(async (req: NextRequest) => {
  const [info, id] = await Promise.all([inquiryInfo(), getVisitorId(req)]);
  return json<InquiryInfoResponse>({ ...info, signedIn: id !== null });
});

/**
 * 문의 `{ category, message, contact?, channel?, source? }` → 우리 문의함(관리자 문의 탭)에 저장하면 접수 끝.
 * GitHub 설정이 있으면 운영자 저장소 이슈로도 보내지만 덤이라 실패해도 접수는 그대로다. 토큰·이슈 주소는 응답에 넣지 않는다.
 * 계정이 있으면 계정 정지 확인 + 계정 하루 3번. 11/20 계정이 없으면 손님 — 연락처 필수, IP 차단 확인, IP 하루 3번·1분 1번.
 * 운영자 IP는 한도 예외.
 */
export const POST = handler(async (req) => {
  const visitorId = await getVisitorId(req);
  const input = await readBody(req, InquirySchema);
  // 숨은 칸을 채운 봇: 접수한 척만 하고 저장·한도는 쓰지 않는다
  if (input.homepage) return json<InquiryResponse>({ ok: true });
  if (visitorId) {
    await assertNotBanned(req, visitorId);
    await rateLimit("inquiry", req, visitorId);
  } else {
    if (!input.contact) throw new HttpError(400, "INVALID_INPUT", "답장 받을 연락처를 적어 주세요.");
    await assertNotBanned(req, null);
    await rateLimit("inquiryGuestBurst", req);
    await rateLimit("inquiryGuest", req);
  }
  const [[me], info] = await Promise.all([
    visitorId ? getAccounts().summaries([visitorId]).catch(() => [null]) : [null],
    inquiryInfo(),
  ]);
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const rec: InquiryRecord = {
    id: nanoid(12),
    at: Date.now(),
    accountId: visitorId,
    name: me?.name ?? null,
    category: input.category,
    message: input.message,
    ...(input.contact ? { contact: input.contact } : {}),
    ...(input.channel !== undefined ? { channel: input.channel } : {}),
    userAgent,
    // 11/20 게임 안 창은 예전처럼 비워 둔다 (없으면 게임)
    ...(input.source === "devnote" ? { source: "devnote" as const } : {}),
  };
  await getInquiries().add(rec);
  await createInquiryIssue({ ...input, accountId: visitorId, name: rec.name, fullId: !info.public, userAgent });
  return json<InquiryResponse>({ ok: true });
});
