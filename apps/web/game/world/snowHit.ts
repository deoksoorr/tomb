// 11/18 눈싸움 맞음 판정 (맞은 사람 화면). 순수 함수라 Phaser 없이 테스트한다 (snowHit.test.ts).
// 사용자 「머리하고 몸에만 맞아야 하는데 이름표에도 맞던데요」: 예전엔 공의 바닥 자리(그림자)만 발 둘레에서 봐서,
// 위아래로 던진 공이 화면에서는 머리 위·이름표 높이를 지나가도 맞았다.
// 이제는 ① 공의 바닥 자리가 발 줄 근처(앞뒤 SNOW_DEPTH 안)이고 ② 화면에 보이는 공(바닥 y − 높이 z)이
// 캐릭터 그림 상자(발 ~ 그림 꼭대기, 몸 폭) 안일 때만 맞는다. 이름표·칭호·말풍선·배지 높이는 상자에 없다.

/** 몸 상자: x = 몸 가운데, y = 발 (땅 위 자리), lift = 그림을 띄운 높이 (점프), top = 발에서 그림 꼭대기까지, half = 몸 반폭 (모두 배율 포함, px) */
export type SnowBody = { x: number; y: number; lift: number; top: number; half: number };

/** 공 바닥 자리가 발 줄에서 앞뒤로 이만큼 안이어야 몸에 닿는다 (그림자가 몸 뒤·앞 멀리 지나가면 아니다) */
export const SNOW_DEPTH = 5;
/** 머리 꾸미기(모자 위로 높이 솟은 장식)는 몸 꼭대기에서 이만큼만 더 친다 */
export const SNOW_HAT_SLACK = 3;
/** 몸 반폭 (배율 1 — 공 반지름을 조금 넣었다) */
export const SNOW_BODY_HALF = 7;
/** 공 반지름만큼 위아래 여유 */
const BALL_R = 1.5;

/** 몸 상자 꼭대기 (발에서, px): 그림 꼭대기(머리 꾸미기 포함)를 쓰되 몸 머리 위로는 SNOW_HAT_SLACK까지만, 바베큐 배율대로 */
export function snowBodyTop(artTop: number, bodyTop: number, big = 1): number {
  return Math.min(artTop, bodyTop + SNOW_HAT_SLACK) * big;
}

/**
 * 공(바닥 gx,gy · 높이 z)이 몸 그림에 닿았으면 맞은 높이 (보이는 발에서 위로, px), 아니면 null.
 * 보이는 공 y = gy − z, 보이는 발 y = y − lift
 */
export function snowBodyHit(gx: number, gy: number, z: number, b: SnowBody): number | null {
  if (Math.abs(gy - b.y) > SNOW_DEPTH) return null;
  if (Math.abs(gx - b.x) > b.half) return null;
  const h = b.y - b.lift - (gy - z);
  if (h < -BALL_R || h > b.top + BALL_R) return null;
  return Math.max(0, Math.min(b.top, h));
}
