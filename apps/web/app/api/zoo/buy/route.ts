import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { WearResponse } from "@/lib/types";
import { readBody } from "@/lib/validate";
import { ZooBuySchema } from "@/lib/zoo/schemas";
import { buyPet } from "@/lib/zoo/service";

/**
 * 동물원 사육사에게서 펫 분양 `{ petId }`: 영구로만 판다 (가격은 서버의 ZOO_PETS). 사면 바로 데리고 다닌다 (+ 착용 증서).
 * 이미 영구로 가졌으면 409 ALREADY_OWNED, 가방에 같은 이용권이 있으면 409 HAS_TICKET, 모자라면 409 NOT_ENOUGH_POINTS
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { petId } = await readBody(req, ZooBuySchema);
  await rateLimit("shop", req, visitorId);
  return json<WearResponse>(await buyPet(visitorId, petId));
});
