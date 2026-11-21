import { z } from "zod";
import { abortChair, type ChairAbortResponse } from "@/lib/chairman/service";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const Body = z.object({
  ticket: z.string().min(1).max(1000),
  /** 싸운 시간 (시작 전이면 0 — 0이 아니면 판을 돌려주지 않는다) */
  durationMs: z.number().finite().min(0).max(24 * 3_600_000),
});

/** 11/22 회장님 독대 시작 전(브리핑) 나가기 `{ ticket, durationMs: 0 }` → 티켓을 버리고, 하루 한 번 유료 판을 돌려준다. 끝났거나 시간이 지난 판은 410 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ticket, durationMs } = await readBody(req, Body);
  return json<ChairAbortResponse>(await abortChair(visitorId, ticket, durationMs));
});
