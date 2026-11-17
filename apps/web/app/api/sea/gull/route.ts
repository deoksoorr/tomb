import { z } from "zod";
import { clientIp, handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { buySnack, gullSnacks, throwSnack, type SnackBuyResult, type SnackThrowResult } from "@/lib/sea/gullService";
import type { GullSnacks } from "@/lib/sea/gull";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const Schema = z.object({ op: z.enum(["buy", "throw"]), kind: z.enum(["plain", "spicy"]) });

/** 11/17 포구 갈매기 과자: 가진 과자 · 오늘 산 개수 (하루 둘 합쳐 10개) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<GullSnacks>(await gullSnacks(visitorId));
});

/**
 * `{ op: "buy", kind }` 매점에서 과자 하나 (갈매기 과자 5P · 매운 새우 과자 8P — 하루 한도 넘으면 409 SNACK_LIMIT)
 * `{ op: "throw", kind }` 갈매기에게 던지기 (없으면 409 NO_SNACK) → 깃털이 떨어졌으면 가방·도감에 (서버가 굴려요)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { op, kind } = await readBody(req, Schema);
  await rateLimit("shop", req, visitorId);
  if (op === "buy") return json<SnackBuyResult>(await buySnack(visitorId, kind));
  return json<SnackThrowResult>(await throwSnack(visitorId, kind, Date.now(), clientIp(req)));
});
