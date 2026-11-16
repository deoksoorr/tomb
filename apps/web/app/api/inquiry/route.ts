import { nanoid } from "nanoid";
import { handler, json } from "@/lib/http";
import { createInquiryIssue, inquiryInfo } from "@/lib/inquiry";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { getInquiries, type InquiryRecord } from "@/lib/store/inquiries";
import type { InquiryInfoResponse, InquiryResponse } from "@/lib/types";
import { InquirySchema, readBody } from "@/lib/validate";

/** 문의를 받을 수 있는지와 GitHub으로도 보내는 저장소가 공개인지 (공개면 문의가 공개된다는 안내를 UI가 띄운다) */
export const GET = handler(async () => json<InquiryInfoResponse>(await inquiryInfo()));

/**
 * 문의 `{ category, message, contact?, channel? }` → 우리 문의함(관리자 문의 탭)에 저장하면 접수 끝.
 * GitHub 설정이 있으면 운영자 저장소 이슈로도 보내지만 덤이라 실패해도 접수는 그대로다.
 * 하루 3번 (방문자·IP 각각, 운영자 IP는 예외). 토큰·이슈 주소는 응답에 넣지 않는다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const input = await readBody(req, InquirySchema);
  await rateLimit("inquiry", req, visitorId);
  const [[me], info] = await Promise.all([getAccounts().summaries([visitorId]).catch(() => [null]), inquiryInfo()]);
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
  };
  await getInquiries().add(rec);
  await createInquiryIssue({ ...input, accountId: visitorId, name: rec.name, fullId: !info.public, userAgent });
  return json<InquiryResponse>({ ok: true });
});
