import { GRANT_TTL_SEC, SEA_KAYAK_SHOUT_COST, signGrant } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { seaOpen } from "@/lib/sea";
import { claimKayakShout, releaseKayakShout } from "@/lib/sea/kayakShout";
import { requireVisitor } from "@/lib/session";
import { displayName, spendPoints } from "@/lib/store";
import { isGraveChannel } from "@/lib/store/channels";
import type { Me } from "@/lib/types";
import { readBody } from "@/lib/validate";

const ShoutSchema = z.object({
  kayak: z.string().regex(/^pK\d$/, "카약이 올바르지 않아요."),
  channel: z.number().int().refine(isGraveChannel, "채널 번호가 올바르지 않아요."),
});

export type KayakShoutResponse = { grant: string; id: string; me: Me };

/**
 * 11/16 r18 카약 「같이 타요」 `{ kayak, channel }`: 계정마다 1분 간격 → 20P → 서명한 증서. 게임이 실시간 서버로 보내면
 * 실시간 서버가 정말 그 카약 앞자리에(뒷자리는 비고) 앉아 있는지 보고 채널에 방송해요 (아니면 환불 증서 → /refund)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!seaOpen()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const { kayak, channel } = await readBody(req, ShoutSchema);
  await rateLimit("megaphone", req, visitorId);
  const now = Date.now();
  const wait = await claimKayakShout(visitorId, now);
  if (wait > 0) throw new HttpError(429, "RATE_LIMITED", `${Math.ceil(wait / 1000)}초 뒤에 다시 부를 수 있어요.`);
  let me: Me;
  try {
    me = await spendPoints(visitorId, SEA_KAYAK_SHOUT_COST, "sea:kayak 같이 타요");
  } catch (e) {
    await releaseKayakShout(visitorId);
    throw e;
  }
  const id = nanoid(10);
  const name = await displayName(visitorId, now);
  const grant = await signGrant(env.joinSecret(), { kind: "kayakShout", visitorId, nonce: id, name, kayak, ch: channel, exp: Math.floor(now / 1000) + GRANT_TTL_SEC });
  return json<KayakShoutResponse>({ grant, id, me });
});
