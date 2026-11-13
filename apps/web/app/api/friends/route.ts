import { friendList } from "@/lib/friends";
import type { FriendListResponse } from "@/lib/friendTypes";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 친구 창: 친구(지금 위치·집)·받은 신청·보낸 신청 (방문자별이라 캐시하지 않는다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("friendRead", req, visitorId);
  return json<FriendListResponse>(await friendList(visitorId));
});
