import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import type { RefCheckResponse } from "@/lib/referralRules";
import { checkReferralCode } from "@/lib/referralService";
import { getVisitorId } from "@/lib/session";

/** 추천 코드 미리 확인 `?code=` (입력 중 디바운스로). 있는 코드인지·내 코드가 아닌지만 보고, 정할 때 서버가 다시 판정한다 */
export const GET = handler(async (req) => {
  const visitorId = await getVisitorId(req);
  await rateLimit("referral", req, visitorId ?? undefined);
  return json<RefCheckResponse>(await checkReferralCode(req.nextUrl.searchParams.get("code"), visitorId));
});
