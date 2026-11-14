import { handler, json } from "@/lib/http";
import { GatherFinishSchema } from "@/lib/forage/schemas";
import { finishGather } from "@/lib/forage/service";
import type { GatherFinishResponse } from "@/lib/forage/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 채집 끝 `{ ticket, result? }`: 게이지 시간·미니게임 결과를 확인하고 가방·도감에 넣는다. 그 자리는 이번 창 동안 빈다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ticket, result } = await readBody(req, GatherFinishSchema);
  return json<GatherFinishResponse>(await finishGather(visitorId, ticket, result, Date.now(), ipHash(req)));
});
