import { handler, json } from "@/lib/http";
import type { LotteryStatus } from "@/lib/lottery";
import { buyTicket, ensureLotterySettled, lotteryDeps, lotteryStatus } from "@/lib/lotteryService";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { loadMe } from "@/lib/store/accounts";
import type { Me } from "@/lib/types";

/** 행운권 창: 지금 회차 상금·판매 장수·내 행운권·지난 추첨 결과. 토요일 저녁 8시가 지났으면 먼저 추첨을 정리한다 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("lottery", req, visitorId);
  const now = Date.now();
  await ensureLotterySettled(now);
  return json<LotteryStatus>(await lotteryStatus(lotteryDeps(), visitorId, now), { headers: { "cache-control": "no-store" } });
});

/** 행운권 한 장 사기 (회차당 한 장, 200P. 운영자 계정은 살 수 없다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("lottery", req, visitorId);
  const now = Date.now();
  await ensureLotterySettled(now);
  const deps = lotteryDeps();
  await buyTicket(deps, visitorId, now);
  return json<LotteryStatus & { me: Me }>({ ...(await lotteryStatus(deps, visitorId, now)), me: await loadMe(deps.accounts, visitorId, now) });
});
