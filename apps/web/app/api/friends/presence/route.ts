import { friendPresence } from "@/lib/friends";
import type { FriendPresenceResponse } from "@/lib/friendTypes";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 접속 알림·지도 하트·받은 신청 빨간 점 (게임 중 주기적으로). 친구 이름·위치와 받은 신청 수만 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("friendRead", req, visitorId);
  return json<FriendPresenceResponse>(await friendPresence(visitorId));
});
