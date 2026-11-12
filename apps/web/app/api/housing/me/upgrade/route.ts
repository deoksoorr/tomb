import { handler, json } from "@/lib/http";
import { UpgradeSchema } from "@/lib/housing/schemas";
import { getHouseStore, upgradePlot } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 집 터 넓히기 `{ to }`: 바로 다음 단계로만. 배치는 그대로 두고 오른쪽·아래로 넓어진다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { to } = await readBody(req, UpgradeSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await upgradePlot(getHouseStore(), visitorId, to));
});
