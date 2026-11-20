import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { buyOffice, officeStatus, type OfficeBuyResult, type OfficeStatus } from "@/lib/office/service";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const BuySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "물건 id가 올바르지 않아요."),
});

/** 11/20 총무팀 문대리: 파는 사무실 가구 (내가 낼 값·가방에 가진 개수) · 내 포인트 · 집이 있는지 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("shop", req, visitorId);
  return json<OfficeStatus>(await officeStatus(visitorId, serverNow(visitorId)));
});

/**
 * 문대리에게서 사기 `{ id }`. 판매 목록 밖이면 400 NOT_SOLD, 집이 없으면 409 NO_HOUSE,
 * 한도까지 가졌으면 409 MAX_OWNED, 포인트가 모자라면 409 NOT_ENOUGH_POINTS
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { id } = await readBody(req, BuySchema);
  await rateLimit("shop", req, visitorId);
  return json<OfficeBuyResult>(await buyOffice(visitorId, id, serverNow(visitorId)));
});
