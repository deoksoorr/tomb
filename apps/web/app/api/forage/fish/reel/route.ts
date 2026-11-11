import { handler, json } from "@/lib/http";
import { ReelSchema } from "@/lib/forage/schemas";
import { reelIn } from "@/lib/forage/service";
import type { ReelResponse } from "@/lib/forage/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 줄다리기 끝 `{ ticket, ok }`. 티켓 서명·한 번만 쓰기·입질 뒤 시간을 확인하고 가방·도감에 넣는다 (ok=false면 놓침) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ticket, ok } = await readBody(req, ReelSchema);
  return json<ReelResponse>(await reelIn(visitorId, ticket, ok));
});
