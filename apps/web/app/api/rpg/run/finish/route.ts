import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { recordHuntLevel } from "@/lib/huntLevelRank";
import { huntDropList, logHunt } from "@/lib/opsLog";
import { RunFinishSchema } from "@/lib/rpg/schemas";
import { finishRun } from "@/lib/rpg/service";
import { verifyTicket } from "@/lib/rpg/ticket";
import type { RunFinishResponse } from "@/lib/rpg/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 판 끝 `{ ticket, result }`. 티켓 서명·한 번만 쓰기·경과 시간을 확인하고, 시드로 다시 만든 출현 계획으로
 * 결과의 상한을 검사한 뒤 EXP·드롭·포인트(사냥 하루 한도 안)를 준다. 거짓 결과는 422로 보상 없이 끝난다
 * 11/26 사냥터 기록: 보상 지급·쓰러짐·나감(그만둠)·서버 판정 거절을 한 줄씩 (응답 뒤에 쓴다)
 * 11/28 드롭은 수만이 아니라 목록도 (같은 것은 합쳐 앞 20칸 — lib/opsLog huntDropList)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ticket, result } = await readBody(req, RunFinishSchema);
  const hunt = result.game === "hunt";
  // 기록용 사냥터·난이도 (서명만 확인 — 저장소는 읽지 않는다)
  const t = hunt ? await verifyTicket(env.sessionSecret(), ticket).catch(() => null) : null;
  const where = t ? { d: t.d, ...(t.z ? { zone: t.z } : {}), ...(t.tw ? { tw: t.tw } : {}) } : {};
  let res: RunFinishResponse;
  try {
    res = await finishRun(visitorId, ticket, result, ipHash(req));
  } catch (e) {
    if (hunt && e instanceof HttpError) logHunt(visitorId, { k: "reject", ...where, code: e.code, msg: e.message.slice(0, 120) });
    throw e;
  }
  await recordHuntLevel(visitorId, res.view.character); // 사냥 레벨 랭킹
  if (result.game === "hunt") {
    const r = res.reward;
    const k = result.died ? "die" : result.quit ? "leave" : "reward";
    const { dl, more } = huntDropList(r.drops);
    logHunt(visitorId, {
      k,
      ...where,
      exp: r.exp,
      pts: r.points,
      drops: r.drops.length,
      ...(dl.length ? { dl } : {}),
      ...(more ? { dlx: more } : {}),
      sec: Math.round(result.durationMs / 1000),
      ...(result.floors ? { floors: result.floors } : {}),
    });
  }
  return json<RunFinishResponse>(res);
});
