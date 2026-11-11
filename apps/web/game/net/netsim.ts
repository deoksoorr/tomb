import { SEND_INTERVAL_MS, STATE, TICK_MS, type DirId, type StateId } from "@tomb/protocol";
import { emptyMove, resolveMove, type MoveInput } from "../logic/movement";
import { MoveThrottle, type NetPose } from "./sendThrottle";

// 원격 이동 보간 측정용 시뮬레이터 (테스트 전용, 순수). 실제 경로를 그대로 흉내 낸다:
//  보내는 쪽 프레임(60fps±) → MoveThrottle(≥100ms) → 업링크 지연·지터(순서 보장) → 서버 틱(50ms, 바뀐 사람만)
//  → 다운링크 지연·지터 → 받는 쪽 onSnapshot(도착 시각) → 매 프레임 sample()
// 그리고 받는 쪽 화면 위치의 매끄러움(프레임당 속도 변동·멈칫·뒤로 밀림)과 지연을 잰다.

export type RemoteInterp = {
  push(t: number, x: number, y: number, state: StateId, dir: DirId): void;
  sample(now: number, out: { x: number; y: number; state: StateId; dir: DirId }): boolean;
};

export type NetProfile = {
  /** 편도 기본 지연 (ms) */
  base: number;
  /** 지터: 지수분포 평균 (ms) */
  jitter: number;
  /** 가끔 튀는 지연 확률·크기 */
  spikeP: number;
  spikeMs: number;
};

export const PROFILES: Record<"lan" | "good" | "jittery" | "bad", NetProfile> = {
  lan: { base: 5, jitter: 1, spikeP: 0, spikeMs: 0 },
  /** 한국 → Cloudflare apac 실측(왕복 ~76ms) 근처 */
  good: { base: 35, jitter: 6, spikeP: 0.005, spikeMs: 60 },
  /** 와이파이·모바일 */
  jittery: { base: 40, jitter: 25, spikeP: 0.03, spikeMs: 150 },
  bad: { base: 70, jitter: 45, spikeP: 0.05, spikeMs: 260 },
};

/** 입력 구간: ms 동안 이 입력을 유지 */
export type Leg = { ms: number; ax: number; ay: number; run?: boolean };

/** 걷기·대각선·달리기·아날로그(조이스틱 0.6)·멈춤이 섞인 기본 경로 */
export const DEFAULT_LEGS: readonly Leg[] = [
  { ms: 600, ax: 0, ay: 0 },
  { ms: 3000, ax: 1, ay: 0 },
  { ms: 2500, ax: 0.7071, ay: 0.7071 },
  { ms: 2500, ax: 0, ay: -1, run: true },
  { ms: 1200, ax: 0, ay: 0 },
  { ms: 3000, ax: -0.6, ay: 0 },
  { ms: 2500, ax: 0, ay: 1 },
  { ms: 1500, ax: 0, ay: 0 },
];

export type SimMetrics = {
  /** 꾸준히 걷는 구간: 프레임당 화면 속도의 변동계수 (표준편차/평균). 낮을수록 매끄럽다 */
  speedCv: number;
  /** 꾸준히 걷는 구간에서 거의 멈춘(실제 속도의 30% 미만) 프레임 비율 */
  stallRatio: number;
  /** 진행 방향 반대로 0.05px 넘게 밀린 프레임 수 (전 구간) */
  backFrames: number;
  /** 화면 위치가 실제보다 늦은 정도 (ms, 꾸준한 구간 평균) */
  lagMs: number;
  /** 지연의 흔들림 (ms, 표준편차) — 클수록 빨라졌다 느려졌다 한다 */
  lagJitterMs: number;
  /** 마지막에 멈춘 자리와 화면 위치의 차이 (px) */
  endErr: number;
  /** 받은 스냅샷 엔트리 수 (대역폭 확인용) */
  entries: number;
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Truth = { t: number; x: number; y: number; vx: number; vy: number; leg: number };

export function simulate(make: () => RemoteInterp, profile: NetProfile, seed = 1, legs: readonly Leg[] = DEFAULT_LEGS): SimMetrics {
  const rnd = mulberry(seed);
  const lat = () => {
    let d = profile.base - Math.log(1 - rnd()) * profile.jitter;
    if (rnd() < profile.spikeP) d += profile.spikeMs * (0.5 + rnd());
    return d;
  };

  // ── 보내는 쪽 ──
  const truth: Truth[] = [];
  const sends: { t: number; pose: NetPose }[] = [];
  const th = new MoveThrottle();
  const mv = emptyMove();
  const input: MoveInput = { ax: 0, ay: 0, run: false };
  let x = 300;
  let y = 300;
  let dir: DirId = 0;
  let t = 0;
  let legStart = 0;
  const total = legs.reduce((s, l) => s + l.ms, 0);
  let leg = 0;
  while (t < total + 600) {
    while (leg < legs.length && t >= legStart + legs[leg].ms) legStart += legs[leg++].ms;
    const L = legs[Math.min(leg, legs.length - 1)];
    const on = leg < legs.length;
    input.ax = on ? L.ax : 0;
    input.ay = on ? L.ay : 0;
    input.run = on ? !!L.run : false;
    resolveMove(input, dir, mv);
    dir = mv.dir;
    const frame = 1000 / 60 + (rnd() - 0.5) * 2;
    truth.push({ t, x, y, vx: mv.vx, vy: mv.vy, leg: on ? leg : -1 });
    const pose: NetPose = { x, y, state: mv.moving ? (mv.running ? STATE.run : STATE.walk) : STATE.idle, dir };
    if (th.shouldSend(t, pose, false)) {
      th.markSent(t, pose);
      sends.push({ t, pose: { ...pose, x: Math.round(x), y: Math.round(y) } });
    }
    x += (mv.vx * frame) / 1000;
    y += (mv.vy * frame) / 1000;
    t += frame;
  }

  // ── 업링크 (순서 보장) → 서버 틱(바뀐 사람만) → 다운링크 ──
  let upPrev = 0;
  const atServer = sends.map((s) => ({ at: (upPrev = Math.max(upPrev, s.t + lat())), pose: s.pose }));
  const recv: { at: number; pose: NetPose }[] = [];
  let downPrev = 0;
  let i = 0;
  let latest: NetPose | null = null;
  let sent: NetPose | null = null;
  const tick0 = rnd() * TICK_MS;
  for (let tk = tick0; tk < t + 1000; tk += TICK_MS) {
    while (i < atServer.length && atServer[i].at <= tk) latest = atServer[i++].pose;
    if (!latest || (sent && sent.x === latest.x && sent.y === latest.y && sent.state === latest.state && sent.dir === latest.dir)) continue;
    sent = latest;
    recv.push({ at: (downPrev = Math.max(downPrev, tk + lat())), pose: latest });
  }

  // ── 받는 쪽: 메시지는 도착 즉시 push, 프레임마다 sample ──
  const ip = make();
  const out = { x: 0, y: 0, state: STATE.idle as StateId, dir: 0 as DirId };
  const frames: { t: number; x: number; y: number }[] = [];
  let j = 0;
  for (let ft = recv[0].at + rnd() * 16; ft < t + 1500; ft += 1000 / 60 + (rnd() - 0.5) * 2) {
    while (j < recv.length && recv[j].at <= ft) {
      const r = recv[j++];
      ip.push(r.at, r.pose.x, r.pose.y, r.pose.state, r.pose.dir);
    }
    if (ip.sample(ft, out)) frames.push({ t: ft, x: out.x, y: out.y });
  }

  // ── 측정 ──
  // 꾸준한 구간: 같은 입력이 2초 이상인 구간에서, 받는 쪽 시각 [시작+800, 끝+100]
  const legBounds: { a: number; b: number; vx: number; vy: number }[] = [];
  let acc = 0;
  for (let k = 0; k < legs.length; k++) {
    const l = legs[k];
    const tr = truth.find((q) => q.leg === k && q.t >= acc + 50);
    if (l.ms >= 2000 && tr && (tr.vx || tr.vy)) legBounds.push({ a: acc + 800, b: acc + l.ms + 100, vx: tr.vx, vy: tr.vy });
    acc += l.ms;
  }
  const speeds: number[] = [];
  let stalls = 0;
  let steady = 0;
  const lags: number[] = [];
  let back = 0;
  let ti = 0;
  for (let k = 1; k < frames.length; k++) {
    const f = frames[k];
    const p = frames[k - 1];
    const dt = (f.t - p.t) / 1000;
    const dx = f.x - p.x;
    const dy = f.y - p.y;
    while (ti < truth.length - 1 && truth[ti + 1].t <= f.t - 250) ti++;
    // 뒤로 밀림: 직전 프레임과 거의 반대 방향(cos < -0.9)으로 0.05px 넘게 움직임 (꺾어 도는 것은 세지 않는다)
    if (k >= 2) {
      const pp = frames[k - 2];
      const ex = p.x - pp.x;
      const ey = p.y - pp.y;
      const a = Math.hypot(dx, dy);
      const b = Math.hypot(ex, ey);
      if (a > 0.05 && b > 0.05 && (dx * ex + dy * ey) / (a * b) < -0.9) back++;
    }
    const lb = legBounds.find((q) => f.t >= q.a && f.t <= q.b);
    if (!lb) continue;
    const v = Math.hypot(lb.vx, lb.vy);
    const s = Math.hypot(dx, dy) / dt;
    speeds.push(s / v);
    steady++;
    if (s < v * 0.3) stalls++;
    // 지연: 화면 위치에 가장 가까운 실제 위치의 시각
    let best = Infinity;
    let bt = 0;
    for (let q = Math.max(0, ti - 60); q < Math.min(truth.length, ti + 60); q++) {
      const d = Math.hypot(truth[q].x - f.x, truth[q].y - f.y);
      if (d < best) {
        best = d;
        bt = truth[q].t;
      }
    }
    lags.push(f.t - bt);
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const sd = (a: number[]) => {
    const m = mean(a);
    return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
  };
  const last = truth[truth.length - 1];
  const lf = frames[frames.length - 1];
  return {
    speedCv: sd(speeds) / Math.max(1e-9, mean(speeds)),
    stallRatio: stalls / Math.max(1, steady),
    backFrames: back,
    lagMs: mean(lags),
    lagJitterMs: sd(lags),
    endErr: Math.hypot(Math.round(last.x) - lf.x, Math.round(last.y) - lf.y),
    entries: recv.length,
  };
}

/** 여러 시드의 평균 */
export function simulateAvg(make: () => RemoteInterp, profile: NetProfile, seeds = 6): SimMetrics {
  const runs = Array.from({ length: seeds }, (_, k) => simulate(make, profile, k + 1));
  const avg = (f: (m: SimMetrics) => number) => runs.reduce((s, m) => s + f(m), 0) / runs.length;
  return {
    speedCv: avg((m) => m.speedCv),
    stallRatio: avg((m) => m.stallRatio),
    backFrames: avg((m) => m.backFrames),
    lagMs: avg((m) => m.lagMs),
    lagJitterMs: avg((m) => m.lagJitterMs),
    endErr: Math.max(...runs.map((m) => m.endErr)),
    entries: avg((m) => m.entries),
  };
}

/** 한 사람이 1초 걸을 때 보내는 MOVE 수 상한 (대역폭 기준) */
export const MAX_MOVES_PER_SEC = 1000 / SEND_INTERVAL_MS;
