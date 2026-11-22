// 11/22 꾸미기·염색(look 증서) 바꿈을 남들에게 바로.
// 예전: 실시간 서버가 연결당 10초 안에 다시 온 look을 버려서, 클라이언트(LookPacer)가 10.5초를 기다렸다 보냈다
// → 색 보관함 칸을 연달아 누르거나 입장 직후 바꾸면 다른 사람 화면에 최대 10초 늦게(입장 직후엔 아예 안) 보였다.
// 이제: 서버가 연결당 토큰 버킷(LOOK_BURST개, LOOK_REFILL_MS마다 하나)으로 받고, 토큰이 없으면 버리지 않고
// 마지막 증서 하나만 들고 있다가 토큰이 차자마자 반영한다. welcome의 lk: 1 = 이 서버 → 클라이언트는 기다리지 않고 바로 보낸다.

/** 연달아 바로 반영되는 look 수 */
export const LOOK_BURST = 4;
/** look 토큰 하나가 다시 차는 시간 (ms) — 꾸준히 바꾸면 이 간격에 하나씩 (예전 10초) */
export const LOOK_REFILL_MS = 1_500;

export type LookBucket = { tokens: number; at: number };

export const newLookBucket = (): LookBucket => ({ tokens: LOOK_BURST, at: -Infinity });

/** 지금 하나 반영해도 되면 토큰을 쓰고 true. 모자라면 false (충전만 반영) */
export function takeLookToken(b: LookBucket, now: number): boolean {
  b.tokens = Number.isFinite(b.at) ? Math.min(LOOK_BURST, b.tokens + Math.max(0, now - b.at) / LOOK_REFILL_MS) : LOOK_BURST;
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
