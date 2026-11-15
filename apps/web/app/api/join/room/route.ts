import { AVATAR_COLORS, signJoinToken } from "@tomb/protocol";
import { env } from "@/lib/env";
import { dexBadgeOf } from "@/lib/forage/service";
import { getHouseStore } from "@/lib/housing/service";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isManager } from "@/lib/managers";
import { isStaff } from "@/lib/staff";
import { getAccounts, NO_NAME } from "@/lib/store";
import { getStyleStore } from "@/lib/store/style";
import { champWireFor } from "@/lib/store/champ";
import { lookOf } from "@/lib/store/accounts";
import { huntGearIds } from "@/lib/rpg/huntGear";
import { getRpgStore } from "@/lib/rpg/store";
import type { RoomJoinResponse } from "@/lib/types";
import { readBody, RoomJoinSchema } from "@/lib/validate";

const ROOM_TOKEN_TTL_SEC = 60;

/**
 * 방(마을·집·사냥터) 입장 토큰 `{ room }`. 채널 토큰과 같은 서명이고 channel 0 + room 클레임이다.
 * 집 방은 있고 숨겨지지 않은 집만. 이름·색·몸 모양·착용품은 계정에 저장된 값을 쓴다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { room } = await readBody(req, RoomJoinSchema);
  await rateLimit("room", req, visitorId);
  if (room.startsWith("house:")) {
    const house = await getHouseStore().get(room.slice("house:".length));
    if (!house || house.hidden) throw new HttpError(404, "NOT_FOUND", "그 집을 찾을 수 없어요.");
  }
  const now = Date.now();
  const accounts = getAccounts();
  // 계정 전체 대신 이름·색·몸·착용만 (명령 9개 → 2개)
  const [a, style, staff, dex, champ, gear, mgr] = await Promise.all([
    accounts.appearance(visitorId, now),
    getStyleStore(accounts).get(visitorId),
    isStaff(visitorId),
    dexBadgeOf(visitorId),
    isStaff(visitorId).then((s) => champWireFor(visitorId, s, now)).catch(() => 0),
    // 11/15 사냥터 방: 낀 사냥 장비 표시 (캐릭터 저장값으로 — 화면이 주장할 수 없다). 사냥터 방만 명령 1개 더
    room.startsWith("hunt:") ? getRpgStore().get(visitorId).then((c) => huntGearIds(c.equip)).catch(() => []) : Promise.resolve([] as string[]),
    // 11/16 매니저 (전용 오라·칭호 — 사냥터에서도)
    isManager(visitorId, now),
  ]);
  const token = await signJoinToken(
    env.joinSecret(),
    // 31번: 운영자 표시는 서버가 확인한 뒤에만. 11/15: 이름은 운영자도 닉네임 그대로
    { visitorId, name: a.name ?? NO_NAME, color: a.color ?? AVATAR_COLORS[0], body: a.body ?? "hood", look: [...lookOf(a), ...gear], dye: style.dye, channel: 0, room, ...(staff ? { staff: true as const } : {}), ...(dex ? { dex } : {}), ...(champ ? { champ } : {}), ...(mgr ? { mgr: true as const } : {}) },
    ROOM_TOKEN_TTL_SEC,
  );
  return json<RoomJoinResponse>({ room, token, wsUrl: `${env.realtimeWsUrl()}/room/${encodeURIComponent(room)}?t=${encodeURIComponent(token)}` });
});
