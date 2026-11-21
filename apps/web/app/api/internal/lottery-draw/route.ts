import { INTERNAL_SIG_HEADER, verifyInternal } from "@tomb/protocol";
import { env } from "@/lib/env";
import { apiError, handler, json } from "@/lib/http";
import { ensureLotterySettled } from "@/lib/lotteryService";
import { getLottery } from "@/lib/store";

/**
 * 11/21 행운권 정각 추첨. 실시간 서버(Cloudflare)의 토요일 20:00 KST 예약 작업이 부른다 (apps/realtime scheduled).
 * 본문 서명(JOIN_SECRET, {op:"lotteryDraw"})이 맞을 때만 — 틀리면 경로가 없는 것처럼 404.
 * 추첨은 입장·행운권 창·머무르기 기록이 부르던 것과 같은 ensureLotterySettled (여러 번 불러도 한 번만 정리된다).
 */
export const POST = handler(async (req) => {
  const sig = req.headers.get(INTERNAL_SIG_HEADER);
  const r = sig ? await verifyInternal(env.joinSecret(), await req.text(), sig) : null;
  if (!r || r.op !== "lotteryDraw") return apiError(404, "NOT_FOUND", "없는 경로예요.");
  await ensureLotterySettled(Date.now());
  return json({ last: await getLottery().last() }, { headers: { "cache-control": "no-store" } });
});
