import { serverNow } from "@/lib/devClock";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { STAY_BONUS_EVERY_MINUTES } from "@/lib/stayBonus";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import type { StayBonusResponse } from "@/lib/types";

/**
 * 접속 시간 보너스 받기 (원자적, lib/stayBonus.ts). 머문 시간은 출석 도장과 같이 서버가 받아 준 머무르기 기록(/api/me/presence)으로만
 * 판정한다 → 클라이언트 시계·탭 여러 개로 늘릴 수 없다. 안 받은 구간을 한꺼번에 받고, 한국 시간 자정에 처음부터.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("stayBonus", req, visitorId);
  const accounts = getAccounts();
  const now = serverNow(visitorId); // 운영은 Date.now() (개발 QA만 시계를 앞당길 수 있다)
  const r = await accounts.claimStayBonus(visitorId, kstDay(now));
  if (!r) throw new HttpError(409, "NOT_YET", `아직 받을 보너스가 없어요. ${STAY_BONUS_EVERY_MINUTES}분 머물 때마다 생겨요.`);
  return json<StayBonusResponse>({ ...r, me: await loadMe(accounts, visitorId, now) });
});
