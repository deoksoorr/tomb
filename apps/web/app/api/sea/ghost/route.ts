import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { buyGhost, ghostStatus, type GhostBuyResult, type GhostStatus } from "@/lib/sea/ghostService";
import { requireVisitor } from "@/lib/session";
import { isGraveChannel } from "@/lib/store/channels";
import { readBody } from "@/lib/validate";

const BuySchema = z.object({
  key: z.string().regex(/^(cosmetic|furniture):[a-z0-9_]{1,32}$/, "물건 이름표가 올바르지 않아요."),
  /** 11/19 지금 채널 (운영자가 그 채널에 부른 동안은 모두 살 수 있어요) */
  ch: z.number().int().refine(isGraveChannel, "채널 번호가 올바르지 않아요.").optional(),
});
/** `?ch=N` (없거나 이상하면 null = 시간표대로) */
const chOf = (raw: string | null): number | null => {
  const n = Number(raw ?? NaN);
  return isGraveChannel(n) ? n : null;
};

/** 11/17 유령선 특가 장터 `?ch=N`: 이번 주 품목 8개 · 내가 낼 값 (유령선·칭호·포인트왕 중 큰 할인 하나) · 산 것 · 열려 있는지 (그 채널에 운영자가 부른 것까지) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("shop", req, visitorId);
  return json<GhostStatus>(await ghostStatus(visitorId, serverNow(visitorId), chOf(req.nextUrl.searchParams.get("ch"))));
});

/**
 * 장터에서 사기 `{ key, ch? }` (key = "cosmetic:id" | "furniture:id"). 정박 시간 밖이면 409 GHOST_CLOSED, 이미 샀으면 409 ALREADY_BOUGHT,
 * 모자라면 409 NOT_ENOUGH_POINTS, 가구인데 집이 없으면 409 NO_HOUSE
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { key, ch } = await readBody(req, BuySchema);
  await rateLimit("shop", req, visitorId);
  return json<GhostBuyResult>(await buyGhost(visitorId, key, serverNow(visitorId), ch ?? null));
});
