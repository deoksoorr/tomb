import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { XmasOpenResponse } from "@/lib/xmas/box";
import { openXmasBox } from "@/lib/xmas/service";

/** 12월 크리스마스 선물상자 하나 열기 (무엇이 나올지는 서버가 뽑는다 — lib/xmas/box XMAS_BOX_TABLE) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("shop", req, visitorId);
  return json<XmasOpenResponse>(await openXmasBox(visitorId));
});
