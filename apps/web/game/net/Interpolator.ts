import { EXTRAPOLATE_MAX_MS, MAX_VALID_SPEED, SEND_INTERVAL_MS, STATE, TELEPORT_DIST, type DirId, type StateId } from "@tomb/protocol";

// 원격 아바타 보간 (27번: 다른 사람 이동 끊김 개선). 순수 클래스라 테스트한다(net.test.ts, netsim.ts로 지터 측정).
//
// 예전 방식(도착 시각 기준 170ms 지연 선형 보간)은 샘플의 "도착 시각"을 시간축으로 썼다. 그런데 샘플은
// 보내는 쪽 100~117ms 간격 + 서버 틱(50ms) 양자화 + 네트워크 지터를 거쳐 도착하므로, 같은 6px 걸음이
// 50ms 만에도 150ms 만에도 지나가 속도가 들쭉날쭉했다(측정: 좋은 망 변동계수 24%, 와이파이급 지터 109%).
//
// 지금 방식 = 경로 따라가기 + 적응형 버퍼:
//  - 받은 위치들을 경유점(waypoint) 줄로 쌓고, 화면 위치는 그 경로를 "추정 속도 × 재생 배율"로 따라간다.
//    → 도착 간격이 흔들려도 걸음 속도는 일정하다.
//  - 추정 속도 = 최근 ~0.6초 동안 이동한 거리 / 걸린 시간 (조이스틱 아날로그 속도도 그대로 따라간다)
//  - 버퍼(남은 경로를 시간으로 환산)가 목표보다 길면 조금 빨리(최대 1.3배), 짧으면 조금 느리게(최소 0.8배) 재생해
//    지연이 쌓이지도, 버퍼가 비지도 않게 한다. 목표 버퍼는 도착 간격의 평균·흔들림으로 정한다(좋은 망은 짧게, 나쁜 망은 길게).
//  - 버퍼가 비면(패킷 지연) 마지막 방향으로 잠깐만 외삽하고(최대 120ms·6px), 넘어간 만큼 뒤로 당기지 않는다.
//  - 순간이동(96px 초과)은 바로 그 자리, 앉기·매달리기·그네 같은 멈춤 자리로는 120ms 안에 미끄러져 들어간다.
//  - 오래 밀렸으면(숨긴 탭에서 돌아옴) 목표 버퍼까지 건너뛴다.

export type Sample = { t: number; x: number; y: number; state: StateId; dir: DirId };
export type InterpOut = { x: number; y: number; state: StateId; dir: DirId };

/** 경유점 상한 (+ 지난 경유점 1개 = 32) */
const MAX_WAYPOINTS = 31;
const moving = (s: StateId) => s === STATE.walk || s === STATE.run || s === STATE.jump || s === STATE.swim || s === STATE.dive;

/** 속도 추정 창 */
const SPEED_WINDOW_MS = 600;
/** 이보다 긴 도착 간격은 "멈췄다 다시 출발"로 보고 속도·간격 통계에 넣지 않는다 */
const STREAM_GAP_MS = 400;
/** 멈춤 자리(의자·나무·그네·서기)로 들어가는 최대 시간 */
const GLIDE_MS = 120;
/** 버퍼가 비었을 때 외삽 상한 */
const EXTRAP_MS = Math.min(120, EXTRAPOLATE_MAX_MS);
const EXTRAP_PX = 6;
/** 외삽으로 지나친 경유점을 "이미 지남"으로 보는 거리 (뒤로 당기지 않는다) */
const OVERSHOOT_PX = EXTRAP_PX + 2;
/** 멈춘 뒤 외삽으로 지나친 만큼을 되돌리는 느린 속도 (px/ms) */
const SETTLE_SPEED = 0.025;
/** 재생 배율 */
const RATE_MIN = 0.8;
const RATE_MAX = 1.3;
/** 버퍼 오차를 이 시간에 걸쳐 갚는다 */
const CATCHUP_MS = 400;
/** 목표 버퍼 범위 (ms) */
const BUFFER_MIN_MS = 60;
const BUFFER_MAX_MS = 320;
/** 버퍼가 이보다 길면(숨긴 탭에서 돌아옴 등) 목표까지 건너뛴다 */
const BUFFER_JUMP_MS = 1500;
const MAX_SPEED = MAX_VALID_SPEED / 1000; // px/ms
/** 처음 걸음 속도 추정 전 기본값 (걷기 px/ms) */
const WALK_GUESS = 0.056;

export class Interpolator {
  /** 아직 지나지 않은 경유점 (오래된 것부터) */
  private wps: Sample[] = [];
  /** 마지막으로 지난 경유점: 멈춰 있을 때의 상태·방향 */
  private cur: Sample | null = null;
  private px = 0;
  private py = 0;
  private lastNow = Number.NaN;
  /** 최근 도착 (속도 추정) */
  private hist: { t: number; x: number; y: number }[] = [];
  /** px/ms */
  private speed = WALK_GUESS;
  private gapAvg = SEND_INTERVAL_MS + 15;
  private gapDev = 15;
  private lastArrival = Number.NaN;
  private rate = 1;
  /** 버퍼 길이(ms) 이동 평균 */
  private bufAvg = Number.NaN;
  /** 마지막 경유점을 지난 뒤 외삽한 거리 (px) */
  private ex = 0;
  private exMs = 0;
  /** 마지막으로 앞으로 움직인 방향 (단위 벡터) */
  private dx = 0;
  private dy = 0;

  /** delay·extrapolateMax는 예전 생성자와의 호환용 (목표 버퍼 상한·외삽 상한으로 쓴다) */
  constructor(
    private readonly maxBufferMs = BUFFER_MAX_MS,
    private readonly extrapolateMax = EXTRAP_MS,
    private readonly teleportDist = TELEPORT_DIST,
  ) {}

  get size(): number {
    return this.wps.length + (this.cur ? 1 : 0);
  }

  get latest(): Sample | null {
    return this.wps.length ? this.wps[this.wps.length - 1] : this.cur;
  }

  /** 지금 목표 버퍼 (ms) — 도착 간격의 평균 절반 + 흔들림 여유 */
  get targetBufferMs(): number {
    return Math.max(BUFFER_MIN_MS, Math.min(this.maxBufferMs, this.gapAvg / 2 + 2 * this.gapDev + 10));
  }

  clear(): void {
    this.wps.length = 0;
    this.cur = null;
    this.hist.length = 0;
    this.lastArrival = Number.NaN;
    this.bufAvg = Number.NaN;
    this.ex = this.exMs = 0;
    this.rate = 1;
  }

  push(t: number, x: number, y: number, state: StateId, dir: DirId): void {
    const tail = this.latest;
    const s: Sample = { t, x, y, state, dir };
    if (!tail || Math.hypot(x - tail.x, y - tail.y) > this.teleportDist) {
      // 처음이거나 순간이동: 지연 없이 바로 그 자리
      this.wps.length = 0;
      this.cur = s;
      this.px = x;
      this.py = y;
      this.hist.length = 0;
      this.ex = this.exMs = 0;
      this.bufAvg = Number.NaN;
      this.lastArrival = t;
      if (moving(state)) this.hist.push({ t, x, y });
      return;
    }
    if (t < tail.t) s.t = t = tail.t; // 시계 역행 방지
    const gap = Number.isNaN(this.lastArrival) ? Infinity : t - this.lastArrival;
    this.lastArrival = t;
    const seg = Math.hypot(x - tail.x, y - tail.y);
    if (moving(state)) {
      if (gap <= STREAM_GAP_MS && moving(tail.state)) {
        // 도착 간격 통계 (목표 버퍼)
        const d = Math.abs(gap - this.gapAvg);
        this.gapAvg += (gap - this.gapAvg) * 0.1;
        this.gapDev += (d - this.gapDev) * 0.1;
      } else this.hist.length = 0;
      this.hist.push({ t, x, y });
      while (this.hist.length > 2 && t - this.hist[0].t > SPEED_WINDOW_MS) this.hist.shift();
      const h = this.hist;
      const span = h[h.length - 1].t - h[0].t;
      if (h.length >= 3 && span >= 150) {
        let len = 0;
        for (let i = 1; i < h.length; i++) len += Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y);
        this.speed = clampSpeed(len / span);
      } else if (seg > 0) {
        // 막 출발: 한 걸음을 보내는 간격 동안 간 것으로 본다
        this.speed = clampSpeed(seg / Math.max(SEND_INTERVAL_MS, Math.min(gap, SEND_INTERVAL_MS * 1.5)));
      }
    } else {
      this.hist.length = 0;
    }
    this.wps.push(s);
    if (this.wps.length > MAX_WAYPOINTS) this.skipTo(this.wps.length - MAX_WAYPOINTS);
  }

  /** now 시점에 그릴 위치를 out에 채운다. 샘플이 없으면 false */
  sample(now: number, out: InterpOut): boolean {
    const cur = this.cur;
    if (!cur) return false;
    const dt = Number.isNaN(this.lastNow) ? 0 : Math.max(0, Math.min(250, now - this.lastNow));
    this.lastNow = now;

    if (this.wps.length) this.follow(dt, out);
    else this.idle(dt, out);
    out.x = this.px;
    out.y = this.py;
    return true;
  }

  /** 경유점을 따라간다 */
  private follow(dt: number, out: InterpOut): void {
    const wps = this.wps;
    const last = wps[wps.length - 1];
    const v = this.speed;
    // 남은 경로 → 버퍼(ms)
    let remain = Math.hypot(wps[0].x - this.px, wps[0].y - this.py);
    for (let i = 1; i < wps.length; i++) remain += Math.hypot(wps[i].x - wps[i - 1].x, wps[i].y - wps[i - 1].y);
    const buf = remain / v;
    const target = this.targetBufferMs;
    if (buf > BUFFER_JUMP_MS) {
      // 한참 밀렸다: 목표 버퍼만 남기고 건너뛴다
      this.jumpAhead(remain - target * v);
    }
    if (moving(last.state)) {
      this.bufAvg = Number.isNaN(this.bufAvg) ? buf : this.bufAvg + (buf - this.bufAvg) * Math.min(1, dt / 300);
      const want = Math.max(RATE_MIN, Math.min(RATE_MAX, 1 + (this.bufAvg - target) / CATCHUP_MS));
      this.rate += (want - this.rate) * Math.min(1, dt / 150);
    } else {
      // 멈추는 중: 더 올 샘플이 없으니 늦출 이유가 없다 (밀려 있으면 따라잡는다)
      this.bufAvg = Number.NaN;
      this.rate = Math.max(1, Math.min(RATE_MAX, 1 + (buf - target) / CATCHUP_MS));
    }
    let step = v * this.rate * dt;
    while (wps.length) {
      const w = wps[0];
      const wx = w.x - this.px;
      const wy = w.y - this.py;
      const d = Math.hypot(wx, wy);
      // 외삽으로 이미 지나친 경유점: 뒤로 당기지 않는다 (멈춤이면 아래 idle에서 천천히 맞춘다)
      if (this.ex > 0 && d <= OVERSHOOT_PX && wx * this.dx + wy * this.dy < 0) {
        this.reach(w, false);
        continue;
      }
      // 멈춤 자리(서기·앉기·나무·그네)로는 짧게 미끄러져 들어간다
      const segStep = moving(w.state) ? step : Math.max(step, (d / GLIDE_MS) * dt);
      if (segStep >= d) {
        this.px = w.x;
        this.py = w.y;
        if (d > 0) this.setDir(wx / d, wy / d);
        step = Math.max(0, segStep - d);
        this.reach(w, true);
        if (!moving(w.state)) break;
        continue;
      }
      this.px += (wx / d) * segStep;
      this.py += (wy / d) * segStep;
      this.setDir(wx / d, wy / d);
      break;
    }
    if (wps.length) {
      const b = wps[0];
      const a = this.cur!;
      // 구간 a→b의 움직임은 b가 만든 것. b가 멈춤·앉기인데 아직 가는 중이면 걷는 모습으로
      out.state = moving(b.state) ? b.state : moving(a.state) ? a.state : b.state;
      out.dir = b.dir;
    } else {
      out.state = this.cur!.state;
      out.dir = this.cur!.dir;
    }
  }

  /** 경유점이 없다: 움직이던 중이면 잠깐 외삽, 멈췄으면 외삽했던 만큼 천천히 제자리로 */
  private idle(dt: number, out: InterpOut): void {
    const cur = this.cur!;
    out.state = cur.state;
    out.dir = cur.dir;
    if (moving(cur.state)) {
      const room = Math.min(this.extrapolateMax - this.exMs, dt);
      if (room > 0 && this.ex < EXTRAP_PX && (this.dx || this.dy)) {
        const d = Math.min(this.speed * this.rate * room, EXTRAP_PX - this.ex);
        this.px += this.dx * d;
        this.py += this.dy * d;
        this.ex += d;
        this.exMs += room;
      }
      return;
    }
    const wx = cur.x - this.px;
    const wy = cur.y - this.py;
    const d = Math.hypot(wx, wy);
    if (d === 0) return;
    const s = SETTLE_SPEED * dt;
    if (s >= d) {
      this.px = cur.x;
      this.py = cur.y;
    } else {
      this.px += (wx / d) * s;
      this.py += (wy / d) * s;
    }
  }

  private reach(w: Sample, onPath: boolean): void {
    this.wps.shift();
    this.cur = w;
    if (onPath) this.ex = this.exMs = 0;
  }

  private setDir(x: number, y: number): void {
    this.dx = x;
    this.dy = y;
  }

  /** 경로를 따라 dist만큼 바로 건너뛴다 */
  private jumpAhead(dist: number): void {
    while (this.wps.length > 1 && dist > 0) {
      const w = this.wps[0];
      const d = Math.hypot(w.x - this.px, w.y - this.py);
      if (d > dist) break;
      dist -= d;
      this.px = w.x;
      this.py = w.y;
      this.reach(w, true);
    }
    this.bufAvg = Number.NaN;
  }

  /** 경유점이 너무 많다: 앞쪽 n개를 건너뛴다 */
  private skipTo(n: number): void {
    for (let i = 0; i < n && this.wps.length > 1; i++) {
      const w = this.wps[0];
      this.px = w.x;
      this.py = w.y;
      this.reach(w, true);
    }
  }
}

function clampSpeed(v: number): number {
  return Math.max(0.01, Math.min(MAX_SPEED, v));
}
