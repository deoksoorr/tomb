import { z } from "zod";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { sellCosmetic } from "@/lib/resellService";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const SellSchema = z.object({ itemId: z.string().regex(/^[a-z0-9_]{1,40}$/) });

/** 11/22 꾸미기 되팔기 `{ itemId }`: 상점 꾸미기를 영구로 벗어 둔 것만, 정가(영구 값)의 30%. 그 아이템의 염색 기록·색 보관함도 사라진다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, SellSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse & { paid: number }>(await sellCosmetic(visitorId, itemId));
});
