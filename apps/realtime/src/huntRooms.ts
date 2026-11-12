import { HUNT_ROOM_STALE_MS, HUNT_ROOMS_MAX, isHuntRoom, type HuntRoomsInfo } from "@tomb/protocol";

// 11/12 사냥터별 지금 사냥 중인 인원 (로비 DO가 들고 있는 순수 상태).
// 사냥터 방 DO가 인원이 바뀔 때(1초 디바운스)와 5분마다(유령 연결 정리 알람) 보고한다(push). 로비는 방을 깨우지 않는다.

export type HuntRoomRec = { count: number; seq: number; at: number };
export type HuntRoomsState = Record<string, HuntRoomRec>;

/** 보고 반영. 늦게 도착한 옛 보고(seq가 작다)는 버린다. 0명이면 지운다. 바뀌었으면 true */
export function applyHuntReport(s: HuntRoomsState, room: string, count: number, seq: number, now: number): boolean {
  if (!isHuntRoom(room) || !Number.isInteger(count) || count < 0 || !Number.isFinite(seq)) return false;
  const prev = s[room];
  if (prev && seq < prev.seq) return false;
  if (count === 0) {
    if (!prev) return false;
    delete s[room];
    return true;
  }
  if (!prev && Object.keys(s).length >= HUNT_ROOMS_MAX) pruneHunt(s, now);
  if (!prev && Object.keys(s).length >= HUNT_ROOMS_MAX) return false;
  s[room] = { count, seq, at: now };
  return !prev || prev.count !== count;
}

/** 오래된(보고가 끊긴) 기록 정리. 지운 게 있으면 true */
export function pruneHunt(s: HuntRoomsState, now: number): boolean {
  let changed = false;
  for (const [id, r] of Object.entries(s)) {
    if (now - r.at <= HUNT_ROOM_STALE_MS) continue;
    delete s[id];
    changed = true;
  }
  return changed;
}

/** GET /hunt-rooms 응답 (오래된 기록은 뺀다) */
export function huntRoomsInfo(s: HuntRoomsState, now: number): HuntRoomsInfo {
  const rooms: Record<string, number> = {};
  for (const [id, r] of Object.entries(s)) if (now - r.at <= HUNT_ROOM_STALE_MS && r.count > 0) rooms[id] = r.count;
  return { rooms, at: now };
}
