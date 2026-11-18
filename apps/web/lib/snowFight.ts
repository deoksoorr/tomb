import { gameDay } from "./gameDay";
import { readItem, writeItem } from "./storage";

// 11/18 마을·캠핑장 눈싸움: 오늘 맞힌 수·맞은 수. 이 기기에만 기억한다 (서버에 보내지 않는다).
// 게임 날짜(새벽 5시)마다 새로 센다. 포인트·랭킹은 없다.
// (「눈싸움 안 하기」 설정은 11/18 사용자 「모든 사람이 다 맞아야 함」으로 없앴다)

const COUNT_KEY = "tomb.snowfight.today";

export type SnowFightTally = { hit: number; got: number };

/** 오늘 맞힌 수·맞은 수 (날짜가 바뀌었거나 저장이 없으면 0) */
export function snowFightToday(now = Date.now()): SnowFightTally {
  try {
    const o = JSON.parse(readItem(COUNT_KEY) ?? "null") as { d?: unknown; hit?: unknown; got?: unknown } | null;
    if (!o || o.d !== gameDay(now)) return { hit: 0, got: 0 };
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { hit: n(o.hit), got: n(o.got) };
  } catch {
    return { hit: 0, got: 0 };
  }
}

/** 하나 더 센다 (hit = 맞혔다, got = 맞았다). 센 뒤 값을 돌려준다 */
export function addSnowFight(kind: keyof SnowFightTally, now = Date.now()): SnowFightTally {
  const t = snowFightToday(now);
  t[kind] = Math.min(9999, t[kind] + 1);
  writeItem(COUNT_KEY, JSON.stringify({ d: gameDay(now), ...t }));
  return t;
}
