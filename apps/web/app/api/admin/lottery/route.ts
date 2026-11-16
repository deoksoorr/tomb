import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { LOTTERY_SUBSIDY_MAX, roundOf } from "@/lib/lottery";
import { adminLotteryStatus, ensureLotterySettled, type AdminLotteryResponse } from "@/lib/lotteryService";
import { getLottery } from "@/lib/store";
import { readBody } from "@/lib/validate";

/** 관리자 행운권 화면: 지금 회차·상금 나눔·최근 추첨 결과(계정 id 포함). 추첨 시각이 지났으면 먼저 정리한다 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const now = Date.now();
  await ensureLotterySettled(now);
  return json<AdminLotteryResponse>(await adminLotteryStatus(now));
});

const SubsidySchema = z.object({
  amount: z.number().int("정수로 적어 주세요.").min(1, "1P 이상 적어 주세요.").max(LOTTERY_SUBSIDY_MAX, `한 번에 ${LOTTERY_SUBSIDY_MAX.toLocaleString("ko-KR")}P까지 더할 수 있어요.`),
});

/** 지원금 더하기 `{ amount }`: 지금 회차 상금에 더한다 (판매 몫 상한과 따로, 상한 없음) */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { amount } = await readBody(req, SubsidySchema);
  const now = Date.now();
  await ensureLotterySettled(now);
  if ((await getLottery().addSubsidy(roundOf(now), amount)) === null) throw new HttpError(409, "CLOSED", "이번 회차는 추첨 중이에요. 잠시 뒤에 다시 해 주세요.");
  return json<AdminLotteryResponse>(await adminLotteryStatus(now));
});
