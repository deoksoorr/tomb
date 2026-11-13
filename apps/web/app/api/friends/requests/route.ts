import { ROOM_ID_RE } from "@tomb/protocol";
import { z } from "zod";
import { requestFriend } from "@/lib/friends";
import type { FriendRequestResponse } from "@/lib/friendTypes";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const PeerSchema = z.object({
  ch: z.number().int().min(1).max(100).optional(),
  room: z.string().max(60).regex(ROOM_ID_RE).optional(),
  sid: z.number().int().min(0).max(1_000_000),
});

/**
 * 친구 신청 `{ ch | room, sid }`: 게임 안에서 누른 사람. 계정은 서버가 실시간 서버에 물어 푼다 (응답에 계정 id 없음).
 * 상대가 먼저 나에게 신청해 뒀으면 바로 친구 (result "accepted")
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ch, room, sid } = await readBody(req, PeerSchema);
  await rateLimit("friend", req, visitorId);
  if ((ch === undefined) === (room === undefined)) throw new HttpError(400, "INVALID_INPUT", "어디에 있는 사람인지 알 수 없어요.");
  return json<FriendRequestResponse>(await requestFriend(visitorId, ch !== undefined ? { ch } : { room: room! }, sid));
});
