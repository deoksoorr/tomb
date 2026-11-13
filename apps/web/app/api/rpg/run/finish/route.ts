import { handler, json } from "@/lib/http";
import { recordHuntLevel } from "@/lib/huntLevelRank";
import { RunFinishSchema } from "@/lib/rpg/schemas";
import { finishRun } from "@/lib/rpg/service";
import type { RunFinishResponse } from "@/lib/rpg/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 판 끝 `{ ticket, result }`. 티켓 서명·한 번만 쓰기·경과 시간을 확인하고, 시드로 다시 만든 출현 계획으로
 * 결과의 상한을 검사한 뒤 EXP·드롭·포인트(사냥 하루 한도 안)를 준다. 거짓 결과는 422로 보상 없이 끝난다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ticket, result } = await readBody(req, RunFinishSchema);
  const res = await finishRun(visitorId, ticket, result, ipHash(req));
  await recordHuntLevel(visitorId, res.view.character); // 사냥 레벨 랭킹
  return json<RunFinishResponse>(res);
});
