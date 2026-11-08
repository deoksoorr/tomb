import { handler, json } from "@/lib/http";
import { issueJoin } from "@/lib/joinToken";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { JoinResponse } from "@/lib/types";
import { JoinRequestSchema, readBody } from "@/lib/validate";

/** 입장 토큰(60초) 발급. 채널 상한은 Channel DO가 강제하고, 여기서는 채널만 고른다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { channel, name, color } = await readBody(req, JoinRequestSchema);
  await rateLimit("join", req, visitorId);
  return json<JoinResponse>(await issueJoin(channel, { visitorId, name, color }));
});
