import {
  EXTRAPOLATE_MAX_MS,
  INTERP_DELAY_MS,
  STATE,
  TELEPORT_DIST,
  TICK_MS,
  type DirId,
  type StateId,
} from "@tomb/protocol";

// 원격 아바타 보간 (명세 4-1):
// - 수신 샘플을 120ms 지연 버퍼에 쌓고 두 샘플 사이를 선형 보간
// - 패킷이 끊기면 최대 200ms까지만 외삽하고 그 자리에 멈춤
// - 96px 넘게 이동하면 보간 없이 즉시 이동
// 시간은 수신 시각(performance.now) 기준. 순수 클래스라 테스트한다.

export type Sample = { t: number; x: number; y: number; state: StateId; dir: DirId };
export type InterpOut = { x: number; y: number; state: StateId; dir: DirId };

const MAX_SAMPLES = 32;
/** 델타 스냅샷이라 멈춰 있던 사람은 샘플이 오지 않는다. 이보다 오래 비었으면 직전 위치를 한 틱 전에 다시 넣어 출발을 부드럽게 만든다 */
const GAP_MS = TICK_MS * 2;

const moving = (s: StateId) => s === STATE.walk || s === STATE.run;

export class Interpolator {
  private buf: Sample[] = [];
  /** 버퍼에서 빠진 직전 샘플 (외삽 속도 계산용) */
  private prev: Sample | null = null;

  constructor(
    private readonly delay = INTERP_DELAY_MS,
    private readonly extrapolateMax = EXTRAPOLATE_MAX_MS,
    private readonly teleportDist = TELEPORT_DIST,
  ) {}

  get size(): number {
    return this.buf.length;
  }

  get latest(): Sample | null {
    return this.buf.length ? this.buf[this.buf.length - 1] : this.prev;
  }

  clear(): void {
    this.buf.length = 0;
    this.prev = null;
  }

  push(t: number, x: number, y: number, state: StateId, dir: DirId): void {
    const last = this.buf.length ? this.buf[this.buf.length - 1] : null;
    if (last) {
      if (Math.hypot(x - last.x, y - last.y) > this.teleportDist) {
        // 순간이동: 버퍼를 비우고 지연 없이 바로 그 자리에 보이게 한다
        this.buf.length = 0;
        this.prev = null;
        this.buf.push({ t: t - this.delay, x, y, state, dir });
        return;
      }
      if (t < last.t) t = last.t; // 시계 역행 방지
      if (t - last.t > GAP_MS) this.buf.push({ ...last, t: t - TICK_MS });
    }
    this.buf.push({ t, x, y, state, dir });
    while (this.buf.length > MAX_SAMPLES) this.prev = this.buf.shift() ?? null;
  }

  /** now 시점에 그릴 위치를 out에 채운다. 샘플이 없으면 false */
  sample(now: number, out: InterpOut): boolean {
    const buf = this.buf;
    if (!buf.length) return false;
    const rt = now - this.delay;

    // rt 이전 샘플은 하나만 남기고 버린다
    while (buf.length >= 2 && buf[1].t <= rt) this.prev = buf.shift() ?? null;

    const a = buf[0];
    if (rt <= a.t || buf.length === 1) {
      if (buf.length === 1 && rt > a.t && moving(a.state) && this.prev) {
        // 외삽: 마지막 속도로 최대 extrapolateMax ms 까지만
        const p = this.prev;
        const dt = a.t - p.t;
        if (dt > 0 && dt <= GAP_MS * 2) {
          const ex = Math.min(rt - a.t, this.extrapolateMax);
          out.x = a.x + ((a.x - p.x) / dt) * ex;
          out.y = a.y + ((a.y - p.y) / dt) * ex;
          out.state = a.state;
          out.dir = a.dir;
          return true;
        }
      }
      out.x = a.x;
      out.y = a.y;
      out.state = a.state;
      out.dir = a.dir;
      return true;
    }

    const b = buf[1];
    const span = b.t - a.t;
    const k = span > 0 ? (rt - a.t) / span : 1;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    // 구간 a→b의 움직임은 b가 만든 것. 다만 b가 "멈춤/앉기"인데 위치가 바뀌었다면 아직 걸어가는 중으로 보여 준다
    if (moving(b.state)) out.state = b.state;
    else if (moving(a.state) && (a.x !== b.x || a.y !== b.y)) out.state = a.state;
    else out.state = b.state;
    out.dir = b.dir;
    return true;
  }
}
