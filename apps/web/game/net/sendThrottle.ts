import { SEND_INTERVAL_MS, STATE, type DirId, type StateId } from "@tomb/protocol";

// MOVE 전송 판단 (명세 4-1):
// - 움직이는 동안 최대 10Hz
// - 상태가 바뀌는 순간 1회 (즉시)
// - 멈춰 있거나 앉아 있으면 아무것도 보내지 않는다 (바뀐 게 없으면 보내지 않음)
// - 탭이 숨겨지면 멈추고, 돌아오면 reset()으로 1회 보낸다

export type NetPose = { x: number; y: number; state: StateId; dir: DirId };
type Sent = NetPose & { t: number };

/** 상태 변화는 즉시 보내되, 같은 프레임 근처의 연속 변화(걷기→달리기 등)는 한 번으로 묶는다 */
export const STATE_CHANGE_GAP_MS = 34;

export function isMovingState(s: StateId): boolean {
  return s === STATE.walk || s === STATE.run;
}

export function decideSend(now: number, cur: NetPose, last: Sent | null, paused: boolean): boolean {
  if (paused) return false;
  if (!last) return true;
  const x = Math.round(cur.x);
  const y = Math.round(cur.y);
  const samePos = x === last.x && y === last.y;
  if (samePos && cur.state === last.state && cur.dir === last.dir) return false;
  const gap = now - last.t;
  if (cur.state !== last.state) return gap >= STATE_CHANGE_GAP_MS;
  return gap >= SEND_INTERVAL_MS;
}

export class MoveThrottle {
  private last: Sent | null = null;
  private seq = 0;

  /** 다음 판단에서 무조건 1회 보내게 한다 (재연결·탭 복귀) */
  reset(): void {
    this.last = null;
  }

  shouldSend(now: number, cur: NetPose, paused: boolean): boolean {
    return decideSend(now, cur, this.last, paused);
  }

  /** 보낸 직후 호출. 다음 seq를 돌려준다 */
  markSent(now: number, cur: NetPose): number {
    this.last = { x: Math.round(cur.x), y: Math.round(cur.y), state: cur.state, dir: cur.dir, t: now };
    this.seq = (this.seq + 1) & 0xffff;
    return this.seq;
  }
}
