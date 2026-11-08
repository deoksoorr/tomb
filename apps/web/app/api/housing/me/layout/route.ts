import { handler, json } from "@/lib/http";
import { LayoutSchema } from "@/lib/housing/schemas";
import { getHouseStore, saveLayout } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 배치 저장 `{ tier, layout }`: 칸·겹침·문·개수를 검사하고, 가진 개수 확인과 저장은 원자적으로 */
export const PUT = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { tier, layout } = await readBody(req, LayoutSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await saveLayout(getHouseStore(), visitorId, tier, layout));
});
