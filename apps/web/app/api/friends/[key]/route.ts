import { friendWhere, removeFriend } from "@/lib/friends";
import type { FriendWhereResponse } from "@/lib/friendTypes";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 친구 한 명의 지금 위치·집 (친구한테 가기 직전). 친구가 아니면 403 */
export const GET = handler<{ key: string }>(async (req, { key }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("friendRead", req, visitorId);
  return json<FriendWhereResponse>(await friendWhere(visitorId, key));
});

/** 친구 끊기 (양쪽에서 함께 사라진다) */
export const DELETE = handler<{ key: string }>(async (req, { key }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("friend", req, visitorId);
  return json(await removeFriend(visitorId, key));
});
