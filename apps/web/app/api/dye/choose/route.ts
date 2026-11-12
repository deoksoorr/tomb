import { DyeChooseSchema } from "@/lib/dye/schemas";
import { chooseDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 46번 시간이 끝난 판의 후보 고르기 `{ seed, apply }`: apply = 새 색으로, 아니면 지금 색 유지. 고르는 시간이 지났으면 유지 (kept) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { seed, apply } = await readBody(req, DyeChooseSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await chooseDye(visitorId, seed, apply));
});
