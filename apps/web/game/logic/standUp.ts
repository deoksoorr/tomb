// 집 안 1인 자리(침대·소파·의자·욕조·책장 …)에서 일어날 때 설 자리. 순수 함수라 테스트한다 (standUp.test.ts).
//
// 11/19 사용자 "상호작용 하기 직전에 있던 자리에 누가 있으면 안 내려가지더라고 (방 안 침대나 뭐)"
//  → 예전엔 언제나 앉기 전 자리(pre)로 순간이동했다. 그 자리에 다른 사람이 서 있으면 겹쳐 서고,
//    그 사이 집주인이 가구를 옮겨 그 자리가 가구·벽 안이 됐으면 몸이 끼었다.
//  이제 앉기 전 자리가 비어 있으면 그대로, 막혔으면(다른 사람·벽·가구) 그 둘레 → 자리(가구) 앞쪽 둘레에서
//  걸을 수 있는 빈 칸을 고른다. 빈 칸이 없으면 겹쳐도 걸을 수 있는 칸, 그것도 없으면 앉기 전 자리.

type Pt = { x: number; y: number };

/** 다른 사람과 이보다 가까우면 겹쳐 보인다 (친구 옆 서기·문 앞 서기와 같다) */
export const STAND_GAP = 10;

/** 앉기 전 자리 둘레 후보 (가까운 순, 아래(가구 앞쪽)를 옆보다 먼저) */
const AROUND: readonly [number, number][] = [
  [0, 0],
  [0, 12],
  [-12, 0],
  [12, 0],
  [-12, 12],
  [12, 12],
  [0, 24],
  [-24, 0],
  [24, 0],
  [0, -12],
  [-24, 12],
  [24, 12],
  [-12, -12],
  [12, -12],
];

/** 자리(가구) 앞쪽 후보: 자리 바로 아래부터 양옆 */
const FRONT: readonly [number, number][] = [
  [0, 16],
  [-12, 16],
  [12, 16],
  [0, 28],
  [-20, 20],
  [20, 20],
  [-24, 0],
  [24, 0],
];

/**
 * 일어나 설 자리. pre = 앉기 전 자리, spot = 앉은 자리(가구 앵커), others = 방의 다른 사람, blocked = 발 상자가 벽·가구·방 밖에 닿는 곳
 */
export function standUpSpot(pre: Pt, spot: Pt, others: Iterable<Pt>, blocked: (x: number, y: number) => boolean): Pt {
  const list = [...others];
  const cands = [
    ...AROUND.map(([dx, dy]) => ({ x: Math.round(pre.x + dx), y: Math.round(pre.y + dy) })),
    ...FRONT.map(([dx, dy]) => ({ x: Math.round(spot.x + dx), y: Math.round(spot.y + dy) })),
  ].filter((c) => !blocked(c.x, c.y));
  const free = cands.find((c) => list.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= STAND_GAP));
  return free ?? cands[0] ?? { x: pre.x, y: pre.y };
}
