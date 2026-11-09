import { handler, json } from "@/lib/http";
import { ExteriorSchema } from "@/lib/housing/schemas";
import { getHouseStore, saveExterior } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 외관 저장 `{ exterior: { roof, facade, door, fence, mailbox, garden, sign } }` (빠진 자리는 기본). 산 아이템만 쓸 수 있다 */
export const PUT = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { exterior } = await readBody(req, ExteriorSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await saveExterior(getHouseStore(), visitorId, exterior));
});
