import { seatsNear, type Seat, type Sid } from "@tomb/protocol";
import { standPoint } from "./sit";

// 새로고침 뒤 자리 복원의 순수 규칙 (lib/resume.ts 기록 → WorldScene). 한 자리에는 무조건 한 명:
//  - 앉아 있던 좌석을 서버가 거절하면(그 사이 다른 사람이 앉음) 가까운 빈 좌석으로, 없으면 그 좌석 앞에 선다
//  - 서 있던 자리에 다른 사람이 서 있으면 살짝 비켜 선다
//  - 나무·그네(1인 소품 자리, logic/spots.ts)도 서버 좌석 점유표로 판정한다: 남이 차지했으면 내려와 옆에 선다

/** 거절된 좌석 대신 앉을 빈자리를 찾는 반경 (모닥불 둘레 자리끼리는 30~50px) */
export const RESTORE_SEAT_RADIUS = 56;
/** 이보다 가까이 다른 사람이 서 있으면 겹친 것으로 본다 */
export const OVERLAP_DIST = 8;
/** 비켜 설 후보 (가까운 순) */
const NUDGES: readonly (readonly [number, number])[] = [
  [0, 0],
  [12, 0],
  [-12, 0],
  [0, 12],
  [0, -12],
  [14, 10],
  [-14, 10],
  [14, -10],
  [-14, -10],
  [24, 0],
  [-24, 0],
  [0, 22],
];

/** deniedId 대신 앉을 가장 가까운 빈 좌석 (없으면 null) */
export function fallbackSeat(denied: Pick<Seat, "id" | "x" | "y">, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): Seat | null {
  for (const s of seatsNear(denied.x, denied.y, RESTORE_SEAT_RADIUS)) {
    if (s.id === denied.id) continue;
    const owner = occupied.get(s.id);
    if (owner === undefined || (mySid !== null && owner === mySid)) return s;
  }
  return null;
}

/** pos에 다른 사람이 서 있으면 겹치지 않는 가까운 지점. blocked(x,y)가 true인 곳(물 등)은 피한다 */
export function nudgeSpot(
  pos: { x: number; y: number },
  others: Iterable<{ x: number; y: number }>,
  blocked: (x: number, y: number) => boolean = () => false,
): { x: number; y: number } {
  const list = [...others];
  for (const [dx, dy] of NUDGES) {
    const x = pos.x + dx;
    const y = pos.y + dy;
    if (dx !== 0 || dy !== 0) {
      if (blocked(x, y)) continue;
    }
    if (list.every((o) => Math.hypot(o.x - x, o.y - y) >= OVERLAP_DIST)) return { x, y };
  }
  return pos;
}

/** 좌석 거절 뒤 갈 곳: 빈 좌석이 있으면 { seat, stand: 그 좌석 앞 }, 없으면 { seat: null, stand: 거절된 좌석 앞(비켜 서기) } */
export function restoreAfterDenied(
  denied: Seat,
  occupied: ReadonlyMap<string, Sid>,
  mySid: Sid | null,
  others: Iterable<{ x: number; y: number }>,
): { seat: Seat | null; stand: { x: number; y: number } } {
  const seat = fallbackSeat(denied, occupied, mySid);
  if (seat) return { seat, stand: standPoint(seat) };
  return { seat: null, stand: nudgeSpot(standPoint(denied), others) };
}

/**
 * (재)접속 welcome에서 붙어 있던 소품 자리(나무·그네)를 서버 점유표로 판정한다 (새로고침 복원·재연결 공통).
 *  - keep: 서버가 이미 내 자리로 기억한다 (유예 안 복귀·재배포 복원)
 *  - claim: 비어 있다 → 다시 요청 (그 사이 누가 먼저면 seatDenied로 내려온다)
 *  - leave: 그 사이 다른 사람이 차지했다 → 내려와 옆에 선다
 */
export function spotVerdict(id: string, seats: Readonly<Record<string, Sid>>, mySid: Sid): "keep" | "claim" | "leave" {
  const owner = seats[id];
  if (owner === undefined) return "claim";
  return owner === mySid ? "keep" : "leave";
}

/** 소품 자리에서 내려설 때 앵커 아래로 (서버 SEAT_STAND_DY와 같다) */
export const SPOT_STAND_DY = 9;

/** 소품 자리를 놓쳤을 때 설 곳: 앵커 바로 앞(차지한 사람 발밑)을 피해 비켜 선다 */
export function standBesideSpot(
  anchor: { x: number; y: number },
  others: Iterable<{ x: number; y: number }>,
  blocked: (x: number, y: number) => boolean = () => false,
): { x: number; y: number } {
  return nudgeSpot({ x: anchor.x, y: anchor.y + SPOT_STAND_DY }, [anchor, ...others], blocked);
}

/** 그네·나무: 저장된 앵커(x,y)와 같은 오브젝트 (2px 안) */
export function anchorAt<T extends { kind: string; ax: number; ay: number }>(list: Iterable<T>, kind: string, x: number, y: number): T | null {
  for (const o of list) if (o.kind === kind && Math.abs(o.ax - x) <= 2 && Math.abs(o.ay - y) <= 2) return o;
  return null;
}

/** 새로고침 복원 자리 판정에 쓰는 땅 정보 (WorldScene이 layout·walkReach로 넘긴다) */
export type ResumeGround = {
  /** 충돌 밖 (발 상자) */
  standable: (x: number, y: number) => boolean;
  inWater: (x: number, y: number) => boolean;
  /** 스폰에서 걸어서 이어지는 땅 */
  reachable: (x: number, y: number) => boolean;
  /** 가까운 안전한 땅 (없으면 null) */
  nearest: (x: number, y: number) => { x: number; y: number } | null;
};

/**
 * 11/16 새로고침 복원 자리 (맵 개편 뒤 막힌 곳·갇힌 곳에 서지 않게). 돌려준 자리에서 시작하고, null이면 입구(SPAWN)에서.
 *  - 서 있기·바닥 앉기: 설 수 있고 걸어서 이어지는 땅이면 그대로, 물속이면 그대로(헤엄쳐 나온다).
 *    막혔거나 갇힌 곳(넓어진 범퍼카 링크 안·우리 안 등)이면 가까운 안전한 땅으로, 그것도 없으면 null
 *  - 그 밖의 자세(그네·나무·해먹·배·시소…): 예전처럼 설 수 있는지만 본다 (앵커·배 자리는 welcome에서 다시 맞춘다)
 */
export function resumeSpot(pos: { x: number; y: number }, pose: string, g: ResumeGround): { x: number; y: number } | null {
  const free = g.standable(pos.x, pos.y);
  if (pose !== "idle" && pose !== "sitGround") return free ? pos : null;
  if (free && (g.inWater(pos.x, pos.y) || g.reachable(pos.x, pos.y))) return pos;
  return g.nearest(pos.x, pos.y);
}
