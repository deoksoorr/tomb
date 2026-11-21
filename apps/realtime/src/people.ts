import type { InternalPerson, PeerWhere } from "@tomb/protocol";

// 11/20 운영자 「접속 중인 사람」 (/internal/people). 테스트: staffTp.test.ts

/** 위치 기억 한 줄 → 운영자 목록 한 줄 (집 id는 빼고, 실내면 inside) */
export function personOf(visitorId: string, w: PeerWhere): InternalPerson {
  return {
    visitorId,
    ch: w.ch,
    sid: w.sid,
    name: w.name ?? "",
    x: w.x,
    y: w.y,
    ...(w.map ? { map: w.map } : {}),
    ...(w.away ? { inside: true as const } : {}),
    ...(w.away && w.place ? { place: w.place } : {}),
  };
}
