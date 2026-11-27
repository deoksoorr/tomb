import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { HttpError, handler, json } from "@/lib/http";
import { buyCampShop, campShopStatus, type CampShopBuyResult, type CampShopStatus } from "@/lib/housing/campExclusive/service";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const kind = z.enum(["caravan", "pension", "rural"], "알 수 없는 집 종류예요.");
const BuySchema = z.object({
  kind,
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "물건 id가 올바르지 않아요."),
});

/** 11/27 캠핑장 NPC 전용 가구 `?kind=caravan|pension|rural`: 파는 물건(내가 낼 값·가방에 가진 개수) · 내 포인트 · 그 종류 집 주인인지 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const k = kind.safeParse(req.nextUrl.searchParams.get("kind"));
  if (!k.success) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 집 종류예요.");
  await rateLimit("shop", req, visitorId);
  return json<CampShopStatus>(await campShopStatus(visitorId, k.data, serverNow(visitorId)));
});

/**
 * 사기 `{ kind, id }`. 그 NPC 목록 밖이면 400 NOT_SOLD, 그 종류 집 주인이 아니면 409 NOT_OWNER,
 * 한도까지 가졌으면 409 MAX_OWNED, 포인트가 모자라면 409 NOT_ENOUGH_POINTS
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, BuySchema);
  await rateLimit("shop", req, visitorId);
  return json<CampShopBuyResult>(await buyCampShop(visitorId, body.kind, body.id, serverNow(visitorId)));
});
