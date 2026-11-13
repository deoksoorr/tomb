// 집에서 나오면 설 자리: 주거 구역의 그 번지 집 문 앞 (걸을 수 있는 칸). 순수 함수라 테스트한다 (doorSpot.test.ts).
// 집에 들어갈 때·나올 때 모두 월드의 내 캐릭터를 이 자리로 옮긴다 → 새로고침 복원(lib/resume.ts)도 문 앞을 기억한다.

import { houseLot } from "@tomb/protocol";

type Pt = { x: number; y: number };

/** 문 앞 후보 (문 바로 아래부터, 가운데 → 양옆 → 조금 더 아래) */
const FRONT: readonly [number, number][] = [
  [0, 14],
  [-10, 14],
  [10, 14],
  [0, 22],
  [-12, 22],
  [12, 22],
  [-20, 16],
  [20, 16],
  [0, 30],
  [-22, 28],
  [22, 28],
];
/** 다른 사람과 이보다 가까우면 겹쳐 보인다 */
const GAP = 10;

/**
 * 그 번지 집 문 앞 설 자리. 막힌 곳(blocked)은 건너뛰고, 다른 사람과 겹치지 않는 가장 가까운 후보.
 * 겹치지 않는 곳이 없으면 겹쳐도 걸을 수 있는 곳, 그것도 없으면 문 바로 아래. 메인 맵에 없는 번지(2단지)면 null
 */
export function doorFront(lot: number, others: Iterable<Pt>, blocked: (x: number, y: number) => boolean): Pt | null {
  const l = houseLot(lot);
  if (!l) return null;
  const list = [...others];
  const cands = FRONT.map(([dx, dy]) => ({ x: l.door.x + dx, y: l.door.y + dy })).filter((c) => !blocked(c.x, c.y));
  const free = cands.find((c) => list.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= GAP));
  return free ?? cands[0] ?? { x: l.door.x, y: l.door.y + FRONT[0][1] };
}
