import { handler, json } from "@/lib/http";
import { createInquiryIssue, inquiryConfig, inquiryInfo } from "@/lib/inquiry";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { InquiryInfoResponse, InquiryResponse } from "@/lib/types";
import { InquirySchema, readBody } from "@/lib/validate";

/** 문의를 받을 수 있는지와 저장소가 공개인지 (공개면 문의가 공개된다는 안내를 UI가 띄운다) */
export const GET = handler(async () => json<InquiryInfoResponse>(await inquiryInfo()));

/**
 * 문의 `{ category, message, contact?, channel? }` → 운영자 GitHub 저장소 이슈.
 * 하루 3번 (방문자·IP 각각, 운영자 IP는 예외). 토큰·이슈 주소는 응답에 넣지 않는다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  inquiryConfig(); // 설정이 없으면 한도를 쓰기 전에 503
  const input = await readBody(req, InquirySchema);
  await rateLimit("inquiry", req, visitorId);
  await createInquiryIssue({ ...input, accountId: visitorId, userAgent: req.headers.get("user-agent") });
  return json<InquiryResponse>({ ok: true });
});
