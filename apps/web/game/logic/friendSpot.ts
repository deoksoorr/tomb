// 친구한테 가기 (같은 채널 마을): 친구 둘레에서 내가 설 칸을 고른다. 순수 함수라 테스트한다 (friendSpot.test.ts).
// 실제 이동은 기존 순간이동(warp: 서버가 범위·쿨다운을 보고, 속도 검증은 건너뛴다)으로 한다.

type Pt = { x: number; y: number };

/** 친구 둘레 후보 (가까운 순): 옆 → 아래·위 → 대각 → 한 칸 더 멀리 */
const RING: readonly [number, number][] = [
  [16, 0],
  [-16, 0],
  [0, 14],
  [0, -12],
  [16, 12],
  [-16, 12],
  [16, -12],
  [-16, -12],
  [28, 0],
  [-28, 0],
  [0, 24],
  [0, -22],
  [28, 18],
  [-28, 18],
  [28, -18],
  [-28, -18],
  [40, 0],
  [-40, 0],
  [0, 36],
  [0, -34],
];
/** 다른 사람과 이보다 가까우면 겹쳐 보인다 */
const GAP = 10;

/**
 * 친구 옆 설 자리: 막힌 곳(담·소품·묘비·물 — blocked)은 건너뛰고, 다른 사람과 겹치지 않는 가장 가까운 후보.
 * 겹치지 않는 곳이 없으면 겹쳐도 걸을 수 있는 곳, 그것도 없으면 친구 자리 그대로 (친구가 서 있으니 설 수 있는 곳이다)
 */
export function besideFriend(friend: Pt, others: Iterable<Pt>, blocked: (x: number, y: number) => boolean): Pt {
  const list = [...others];
  const cands = RING.map(([dx, dy]) => ({ x: Math.round(friend.x + dx), y: Math.round(friend.y + dy) })).filter((c) => !blocked(c.x, c.y));
  const free = cands.find((c) => list.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= GAP));
  return free ?? cands[0] ?? { x: Math.round(friend.x), y: Math.round(friend.y) };
}
