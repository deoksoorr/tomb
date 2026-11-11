import { seatsNear, type Seat, type Sid } from "@tomb/protocol";
import { standPoint } from "./sit";

// 새로고침 뒤 자리 복원의 순수 규칙 (lib/resume.ts 기록 → WorldScene). 한 자리에는 무조건 한 명:
//  - 앉아 있던 좌석을 서버가 거절하면(그 사이 다른 사람이 앉음) 가까운 빈 좌석으로, 없으면 그 좌석 앞에 선다
//  - 서 있던 자리에 다른 사람이 서 있으면 살짝 비켜 선다

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

/** 그네·나무: 저장된 앵커(x,y)와 같은 오브젝트 (2px 안) */
export function anchorAt<T extends { kind: string; ax: number; ay: number }>(list: Iterable<T>, kind: string, x: number, y: number): T | null {
  for (const o of list) if (o.kind === kind && Math.abs(o.ax - x) <= 2 && Math.abs(o.ay - y) <= 2) return o;
  return null;
}
