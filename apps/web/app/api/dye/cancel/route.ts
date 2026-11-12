import { DyeCancelSchema } from "@/lib/dye/schemas";
import { cancelDye } from "@/lib/dye/service";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 46번 염색 포기 `{ seed }` (창 닫기): 색은 그대로 두고 판을 끝낸다. 염색권은 돌려주지 않는다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { seed } = await readBody(req, DyeCancelSchema);
  return json<{ cancelled: boolean }>(await cancelDye(visitorId, seed));
});
