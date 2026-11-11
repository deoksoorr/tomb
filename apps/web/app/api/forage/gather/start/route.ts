import { handler, json } from "@/lib/http";
import { GatherStartSchema } from "@/lib/forage/schemas";
import { startGather } from "@/lib/forage/service";
import type { GatherStartResponse } from "@/lib/forage/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 채집 시작 `{ node }` → 티켓 + 게이지 시간 (곤충 수풀이면 미니게임 시드) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { node } = await readBody(req, GatherStartSchema);
  return json<GatherStartResponse>(await startGather(visitorId, node));
});
