import { handler, json } from "@/lib/http";
import { RunStartSchema } from "@/lib/rpg/schemas";
import { startRun } from "@/lib/rpg/service";
import type { RunStartResponse } from "@/lib/rpg/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 판 시작 `{ game, difficulty }` → 서명된 런 티켓 + 시드. 계정당 한 시간에 30판, 진행 중인 판은 하나 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { game, difficulty } = await readBody(req, RunStartSchema);
  return json<RunStartResponse>(await startRun(visitorId, game, difficulty));
});
