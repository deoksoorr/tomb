import { handler, json } from "@/lib/http";
import { StyleSchema } from "@/lib/housing/schemas";
import { getHouseStore, setCottageStyle } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/16 내 포구 오두막 겉모습 바꾸기 `{ style }` (무료) */
export const PUT = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { style } = await readBody(req, StyleSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await setCottageStyle(getHouseStore(), visitorId, style));
});
