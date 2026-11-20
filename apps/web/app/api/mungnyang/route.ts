import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { buyMungnyang, mungnyangStatus, type MungnyangBuyResult, type MungnyangStatus } from "@/lib/mungnyang/service";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const BuySchema = z.object({
  /** pet = 펫 영구 분양 · furn = 집 가구 */
  kind: z.enum(["pet", "furn"], "고를 칸이 올바르지 않아요."),
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "물건 id가 올바르지 않아요."),
});

/** 11/19 분양사 보리: 파는 펫·집 가구 (가구는 내가 낼 값·가방에 가진 개수) · 내 포인트 · 집이 있는지 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("shop", req, visitorId);
  return json<MungnyangStatus>(await mungnyangStatus(visitorId, serverNow(visitorId)));
});

/**
 * 분양사에게서 사기 `{ kind, id }`. 판매 목록 밖이면 400 NOT_SOLD,
 * 펫: 이미 가족이면 409 ALREADY_OWNED, 가방에 같은 이용권이 있으면 409 HAS_TICKET (사면 바로 데리고 다닌다),
 * 가구: 집이 없으면 409 NO_HOUSE, 한도까지 가졌으면 409 MAX_OWNED, 포인트가 모자라면 둘 다 409 NOT_ENOUGH_POINTS
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { kind, id } = await readBody(req, BuySchema);
  await rateLimit("shop", req, visitorId);
  return json<MungnyangBuyResult>(await buyMungnyang(visitorId, kind, id, serverNow(visitorId)));
});
