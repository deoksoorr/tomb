import { ROOM_ID_RE } from "@tomb/protocol";
import { z } from "zod";
import { peerDex } from "@/lib/forage/service";
import type { PublicDex } from "@/lib/forage/types";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const PeerDexSchema = z.object({
  ch: z.number().int().min(1).max(100).optional(),
  room: z.string().max(60).regex(ROOM_ID_RE).optional(),
  sid: z.number().int().min(0).max(1_000_000),
});

/**
 * 게임 안에서 누른 다른 사람의 도감 `{ ch | room, sid }`. 계정은 서버가 실시간 서버에 물어 푼다 (응답에 계정 id 없음).
 * 이름·칸별 기록·칭호만 (가방·포인트는 보이지 않는다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ch, room, sid } = await readBody(req, PeerDexSchema);
  await rateLimit("rank", req, visitorId);
  if ((ch === undefined) === (room === undefined)) throw new HttpError(400, "INVALID_INPUT", "어디에 있는 사람인지 알 수 없어요.");
  return json<PublicDex>(await peerDex(ch !== undefined ? { ch } : { room: room! }, sid));
});
