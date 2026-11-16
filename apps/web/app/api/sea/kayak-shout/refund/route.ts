import { SEA_KAYAK_SHOUT_COST, verifyGrant } from "@tomb/protocol";
import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { releaseKayakShout } from "@/lib/sea/kayakShout";
import { requireVisitor } from "@/lib/session";
import { refundPoints } from "@/lib/store";
import { onceClaim, onceDone } from "@/lib/store/once";
import type { Me } from "@/lib/types";
import { readBody } from "@/lib/validate";

const RefundSchema = z.object({ refund: z.string().min(10).max(1200) });

/**
 * 11/16 r18 카약 「같이 타요」 돌려받기 `{ refund }`: 실시간 서버가 외침을 받지 못했을 때(앞자리가 아님·뒷자리가 참) 내준 증서로 20P를 돌려줘요.
 * 증서 하나에 한 번만 (같은 증서를 다시 보내면 409). 간격도 풀어서 바로 다시 부를 수 있어요
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { refund } = await readBody(req, RefundSchema);
  await rateLimit("megaphone", req, visitorId);
  const g = await verifyGrant(env.joinSecret(), refund);
  if (!g || g.kind !== "kayakRefund" || g.visitorId !== visitorId) throw new HttpError(400, "INVALID_INPUT", "돌려받을 수 없는 증서예요.");
  if ((await onceClaim(`kshout-refund:${g.nonce}`)) !== null) throw new HttpError(409, "ALREADY", "이미 돌려받았어요.");
  const me: Me = await refundPoints(visitorId, SEA_KAYAK_SHOUT_COST, "sea:kayak 같이 타요 돌려받기");
  await onceDone(`kshout-refund:${g.nonce}`, "ok");
  await releaseKayakShout(visitorId);
  return json({ me });
});
