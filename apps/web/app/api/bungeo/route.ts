import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { buyBungeo, bungeoStatus, type BungeoBuyResult, type BungeoStatus } from "@/lib/bungeo/service";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const BuySchema = z.object({ id: z.string().regex(/^[a-z0-9_]{1,32}$/, "물건 이름이 올바르지 않아요.") });

/** 11/22 골목 붕어빵 수레: 열려 있는지 · (열린 밤에만) 판매 목록·값·가진 것. 일정은 싣지 않는다 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("shop", req, visitorId);
  return json<BungeoStatus>(await bungeoStatus(visitorId, serverNow(visitorId)));
});

/** 사기 `{ id }`. 닫힌 시간이면 409 BUNGEO_CLOSED, 이미 가졌으면 409 ALREADY_OWNED, 모자라면 409 NOT_ENOUGH_POINTS */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { id } = await readBody(req, BuySchema);
  await rateLimit("shop", req, visitorId);
  return json<BungeoBuyResult>(await buyBungeo(visitorId, id, serverNow(visitorId)));
});
