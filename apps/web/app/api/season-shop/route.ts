import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { buySeason, seasonStatus, type SeasonBuyResult, type SeasonStatus } from "@/lib/seasonShop/service";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const KIND = z.enum(["cos", "furn"], "노점 종류가 올바르지 않아요.");
const BuySchema = z.object({
  kind: KIND,
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "물건 id가 올바르지 않아요."),
  /** 코디: day = 24시간 이용권 · perm = 영구 (가구는 보지 않는다) */
  mode: z.enum(["day", "perm"]).default("perm"),
});

/** 11/19 기간 한정 노점 `?kind=cos|furn`: 판매 중·판매 예정 묶음 (세트별) · 내가 낼 값 · 남은 날 기준 시각 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("shop", req, visitorId);
  const k = KIND.safeParse(req.nextUrl.searchParams.get("kind") ?? "cos");
  if (!k.success) throw new HttpError(400, "INVALID_INPUT", "노점 종류가 올바르지 않아요.");
  return json<SeasonStatus>(await seasonStatus(visitorId, k.data, serverNow(visitorId)));
});

/**
 * 노점에서 사기 `{ kind, id, mode }`. 판매 예정이면 409 SEASON_SOON, 판매가 끝났으면 409 SEASON_ENDED, 일정에 없으면 400 NOT_SOLD,
 * 이미 가졌으면 409 ALREADY_OWNED (영구 사기에 같은 이용권이 가방에 있으면 HAS_TICKET), 모자라면 409 NOT_ENOUGH_POINTS, 가구인데 집이 없으면 409 NO_HOUSE
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { kind, id, mode } = await readBody(req, BuySchema);
  await rateLimit("shop", req, visitorId);
  return json<SeasonBuyResult>(await buySeason(visitorId, kind, id, mode, serverNow(visitorId)));
});
