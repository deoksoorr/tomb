import { handler, json } from "@/lib/http";
import { RunStartSchema } from "@/lib/rpg/schemas";
import { startRun } from "@/lib/rpg/service";
import type { RunStartResponse } from "@/lib/rpg/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 판 시작 `{ game, difficulty, zone?, burnout? }` → 서명된 런 티켓 + 시드. 계정당 한 시간에 30판, 진행 중인 판은 하나. 사냥터는 레벨로 열린다 (40번).
 * 11/15 burnout = 번아웃 단계 (레벨 50·열린 단계·오늘 남은 도전을 서버가 확인, 사냥터는 단계마다 정해져 있다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { game, difficulty, zone, planVer, burnout } = await readBody(req, RunStartSchema);
  return json<RunStartResponse>(await startRun(visitorId, game, difficulty, Date.now(), zone, planVer, burnout));
});
