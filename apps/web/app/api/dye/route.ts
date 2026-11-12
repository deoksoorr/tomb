import { dyeState } from "@/lib/dye/service";
import type { DyeStateResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";

/** 46번: 진행 중인 무작위 염색(있으면 이어서) + 내 가방의 고정 색 염색권 정의. 시간이 지난 판은 여기서 가운데 색으로 정해진다 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<DyeStateResponse>(await dyeState(visitorId));
});
