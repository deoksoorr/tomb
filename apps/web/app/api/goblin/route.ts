import { z } from "zod";
import { claimGoblin, type GoblinClaimResponse } from "@/lib/goblin";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const Body = z.object({ grant: z.string().min(10).max(400) });

/**
 * 22번 황금 고블린 보상 `{ grant }`. 실시간 서버가 가장 먼저 잡은 사람에게 서명해 준 증서만 받는다.
 * 고블린 한 마리당 한 번(nonce), 내 증서만, 하루 한도(EARN_RULES "goblin") 안에서 지급한다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const { grant } = await readBody(req, Body);
  return json<GoblinClaimResponse>(await claimGoblin(visitorId, grant, ipHash(req)));
});
