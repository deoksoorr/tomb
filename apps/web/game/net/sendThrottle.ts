import { SEND_INTERVAL_MS, STATE, type DirId, type StateId } from "@tomb/protocol";

// MOVE 전송 판단 (명세 4-1):
// - 어떤 경우에도 MOVE 간격은 SEND_INTERVAL_MS(100ms) 이상 → 최대 10Hz
// - 상태가 바뀌면 last.t+100ms까지 보류했다가, 그 시점의 "최신" 상태로 1회 보낸다
//   (쉬프트·방향키를 연타해도 중간 상태는 합쳐져서 마지막 것만 나간다)
// - 멈춰 있거나 앉아 있으면 아무것도 보내지 않는다 (바뀐 게 없으면 보내지 않음)
// - 탭이 숨겨지면 멈추고, 돌아오면 reset()으로 1회 보낸다 (이때도 100ms 간격은 지킨다)
// - 11/17 상태·방향은 같고 위치만 바뀌면(꾸준히 걷기) steadyMs(MOVE_STEADY_MS 150ms) 간격으로만 보낸다 — DO 요청 수 절약.
//   서버가 위치로 판정하는 요청(앉기·고블린 잡기) 직전에는 flushDue로 지금 위치를 먼저 보낸다 (100ms 간격은 지킨다)

export type NetPose = { x: number; y: number; state: StateId; dir: DirId };
type Sent = NetPose & { t: number };

export function isMovingState(s: StateId): boolean {
  return s === STATE.walk || s === STATE.run || s === STATE.jump;
}

/**
 * last: 마지막으로 보낸 상태 (없으면 null). lastT: 마지막 전송 시각 (reset 후에도 유지).
 * steadyMs: 위치만 바뀐 경우의 간격 (기본 SEND_INTERVAL_MS = 예전처럼 10Hz)
 */
export function decideSend(now: number, cur: NetPose, last: NetPose | null, lastT: number, paused: boolean, steadyMs: number = SEND_INTERVAL_MS): boolean {
  if (paused) return false;
  const gap = now - lastT;
  if (gap < SEND_INTERVAL_MS) return false;
  if (!last) return true;
  if (cur.state !== last.state || cur.dir !== last.dir) return true;
  return gap >= steadyMs && (Math.round(cur.x) !== last.x || Math.round(cur.y) !== last.y);
}

export class MoveThrottle {
  private last: Sent | null = null;
  private lastT = -Infinity;
  private seq = 0;

  /** steadyMs: 꾸준히 걷는 동안의 MOVE 간격 (클라이언트는 MOVE_STEADY_MS를 넘긴다) */
  constructor(private readonly steadyMs: number = SEND_INTERVAL_MS) {}

  /** 다음 판단에서 바뀐 게 없어도 1회 보내게 한다 (재연결·탭 복귀). 간격 제한은 그대로 */
  reset(): void {
    this.last = null;
  }

  /** steadyMs를 주면 이번 판단만 그 간격으로 (방에 혼자일 때 ROOM_SOLO_STEADY_MS) */
  shouldSend(now: number, cur: NetPose, paused: boolean, steadyMs: number = this.steadyMs): boolean {
    return decideSend(now, cur, this.last, this.lastT, paused, Math.max(steadyMs, SEND_INTERVAL_MS));
  }

  /** 위치로 판정하는 요청(앉기 등) 직전: 보낸 뒤 위치가 바뀌었으면 꾸준한 간격을 기다리지 않고 지금 보낼지 (100ms 간격은 지킨다) */
  flushDue(now: number, cur: NetPose, paused: boolean): boolean {
    return decideSend(now, cur, this.last, this.lastT, paused);
  }

  /** 지금 보내도 간격 제한에 걸리지 않는지, 아니면 몇 ms 뒤에 보낼 수 있는지 */
  waitMs(now: number): number {
    return Math.max(0, this.lastT + SEND_INTERVAL_MS - now);
  }

  /** 마지막으로 보낸 상태가 걷기/달리기였는지 (탭이 숨을 때 멈춤을 알릴지 판단) */
  get lastWasMoving(): boolean {
    return !!this.last && isMovingState(this.last.state);
  }

  /** 보낸 직후 호출. 이번 메시지의 seq를 돌려준다 */
  markSent(now: number, cur: NetPose): number {
    this.last = { x: Math.round(cur.x), y: Math.round(cur.y), state: cur.state, dir: cur.dir, t: now };
    this.lastT = now;
    this.seq = (this.seq + 1) & 0xffff;
    return this.seq;
  }
}
