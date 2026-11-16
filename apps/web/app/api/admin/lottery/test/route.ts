import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { roundOf } from "@/lib/lottery";
import { adminLotteryStatus, lotteryDeps, settleLottery, type AdminLotteryResponse } from "@/lib/lotteryService";
import { testServerEnv } from "@/lib/rpg/superHunter";

/**
 * 테스트 서버 전용 (운영 404): 지금 회차를 바로 추첨한다. 실제 추첨과 같은 길(당첨 선물·마을 공지)로 하되 결과는 시험 기록으로 남기고,
 * 그 회차의 표·지원금을 비워 다시 팔게 한다. 이월은 실제처럼 이어진다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  if (!testServerEnv()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const now = Date.now();
  const r = await settleLottery(lotteryDeps(), roundOf(now), now, { test: true });
  if (r.busy) throw new HttpError(409, "BUSY", "다른 추첨이 진행 중이에요. 잠시 뒤에 다시 해 주세요.");
  return json<AdminLotteryResponse>(await adminLotteryStatus(now));
});
