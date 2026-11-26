import { handler, json } from "@/lib/http";
import { CampDesignSchema, StyleSchema } from "@/lib/housing/schemas";
import { getHouseStore, setCaravanDesign, setCottageStyle } from "@/lib/housing/service";
import { notifyHomes } from "@/lib/housing/homesNotify";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { parseWith, readJson } from "@/lib/validate";

/** 11/16 내 포구 오두막 겉모습 바꾸기 `{ style }` (무료). 11/26 `{ zone: "camp", design }` = 내 카라반 디자인 바꾸기 (무료) */
export const PUT = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const raw = await readJson(req);
  if ((raw as Record<string, unknown> | null)?.zone === "camp") {
    const { design } = parseWith(CampDesignSchema, raw);
    await rateLimit("shop", req, visitorId);
    return json<MyHouseResponse>(notifyHomes(await setCaravanDesign(getHouseStore(), visitorId, design)));
  }
  const { style } = parseWith(StyleSchema, raw);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(notifyHomes(await setCottageStyle(getHouseStore(), visitorId, style)));
});
