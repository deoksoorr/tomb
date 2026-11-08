import { handler, json } from "@/lib/http";
import { issueJoin } from "@/lib/joinToken";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, lookOf } from "@/lib/store/accounts";
import type { JoinResponse } from "@/lib/types";
import { JoinRequestSchema, readBody } from "@/lib/validate";

/**
 * 입장 토큰(60초) 발급. 채널 상한은 Channel DO가 강제하고, 여기서는 채널만 고른다.
 * 전체 만석이면 대기열 주소(`{ mode: "queue" }`)를 준다. 토큰에는 지금 착용 중인 꾸미기가 들어간다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { channel, name, color } = await readBody(req, JoinRequestSchema);
  await rateLimit("join", req, visitorId);
  const now = Date.now();
  const look = lookOf(await getAccounts().get(visitorId, kstDay(now), now));
  return json<JoinResponse>(await issueJoin(channel, { visitorId, name, color, look }));
});
