import { handler, json } from "@/lib/http";
import { logHunt } from "@/lib/opsLog";
import { RunStartSchema } from "@/lib/rpg/schemas";
import { startRun } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import type { RunStartResponse } from "@/lib/rpg/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 판 시작 `{ game, difficulty, zone?, tower? }` → 서명된 런 티켓 + 시드. 계정당 한 시간에 30판, 진행 중인 판은 하나. 사냥터는 레벨로 열린다 (40번).
 * 11/15 tower = 야근 빌딩 시작 층 (레벨 50·최고 기록으로 연 체크포인트인지 서버가 확인, 층마다 사냥터는 정해져 있다)
 * 11/26 사냥터 기록: 입장 한 줄, 앞 판을 끝내지 못한 채 새 판이면 「튕김」 한 줄 (응답 뒤에 쓴다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { game, difficulty, zone, planVer, tower } = await readBody(req, RunStartSchema);
  const hunt = game === "hunt";
  const unfinished = hunt ? await getRpgStore().activeRun(visitorId).catch(() => null) : null;
  const res = await startRun(visitorId, game, difficulty, Date.now(), zone, planVer, tower);
  if (hunt) {
    if (unfinished) logHunt(visitorId, { k: "drop", msg: "앞 판을 끝내지 못하고 새 판을 시작" });
    logHunt(visitorId, { k: "start", d: difficulty, ...(zone ? { zone } : {}), ...(tower ? { tw: tower } : {}) });
  }
  return json<RunStartResponse>(res);
});
