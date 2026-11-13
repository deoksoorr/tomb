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

/** 친구한테 가기: 이동이 끝나면 가운데 안내 띠에 한 번만 띄우는 말 (마을·집 안 공통. 가는 중… 안내는 따로 띄우지 않는다) */
export const FRIEND_ARRIVED = "도착했어요!";

/**
 * 따라 들어간 집에서 친구를 기다리는 끝 시각. 기준은 게임 루프 시각(game.loop.time)이어야 한다:
 * 씬 시계(this.time.now)는 씬이 처음 더해질 때 값에 멈춰 있다가 첫 update에서야 따라오므로,
 * create()에서 읽으면 한참 옛 값이라 기다리기도 전에 "못 찾았어요"가 떴다
 */
export function followDeadline(loopNow: number, waitMs: number): number {
  return loopNow + waitMs;
}

/** 집 방 사람들 가운데 따라온 친구 (이름이 같은 사람, 이름 앞뒤 공백 무시) */
export function findFollowed<T extends { name: string }>(remotes: Iterable<T>, name: string): T | null {
  const want = name.trim();
  if (!want) return null;
  for (const r of remotes) if (r.name.trim() === want) return r;
  return null;
}

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
