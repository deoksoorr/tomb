import { z } from "zod";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import type { ReferralView } from "@/lib/referralRules";
import { enterReferral, referralView } from "@/lib/referralService";
import { recordSignals, requestSignals } from "@/lib/sameUser";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 내 정보 추천 칸: 내 추천 코드(처음이면 만든다)·데려온 이웃 수·받은 보상·나를 데려온 이웃 진행·추천인을 정할 수 있는 마감 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("referral", req, visitorId);
  return json<ReferralView>(await referralView(visitorId));
});

const EnterSchema = z.object({
  code: z.string().max(20),
  /** signup = 새로 시작 화면에서. 11/19 내 정보에서 뒤늦게 넣기(later)는 없앴다 — 받아도 거절한다 */
  via: z.enum(["signup", "later"]).optional(),
});

/** 추천인 정하기 `{ code, via }` (한 번만, 가입할 때만 — 가입 직후 짧은 창 안). 규칙은 lib/referralRules.ts */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("referral", req, visitorId);
  const { code, via } = await readBody(req, EnterSchema);
  const now = Date.now();
  // 같은 사람 판정: 지금 기기·브라우저 환경·대역을 먼저 남기고 (판정에 들어간다), 가입 IP·대역을 넘긴다
  await recordSignals(req, visitorId, now);
  await enterReferral(visitorId, code, requestSignals(req), via ?? "later", now);
  return json<ReferralView>(await referralView(visitorId, now));
});
