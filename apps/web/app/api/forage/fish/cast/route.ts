import { handler, json } from "@/lib/http";
import { CastSchema } from "@/lib/forage/schemas";
import { castLine } from "@/lib/forage/service";
import type { CastResponse } from "@/lib/forage/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 찌 던지기 `{ spot }` → 서명된 티켓 + 입질까지 시간·손맛. 무엇이 걸렸는지는 서버만 안다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { spot } = await readBody(req, CastSchema);
  return json<CastResponse>(await castLine(visitorId, spot));
});
