import { describe, expect, it } from "vitest";
import { DIR, EXTRAPOLATE_MAX_MS, INTERP_DELAY_MS, SEND_INTERVAL_MS, STATE } from "@tomb/protocol";
import { BACKOFF_MAX_MS, backoffDelay } from "./backoff";
import { Interpolator, type InterpOut } from "./Interpolator";
import type { DirId } from "@tomb/protocol";
import { emptyMove, resolveMove } from "../logic/movement";
import { JoinLimiter, isPermanentJoinError, reusableToken, utf8Bytes, JOIN_WINDOW_MS, TOKEN_REUSE_MS } from "./joinPolicy";
import { MoveThrottle, decideSend, type NetPose } from "./sendThrottle";

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

const out = (): InterpOut => ({ x: 0, y: 0, state: STATE.idle, dir: DIR.down });

describe("Interpolator", () => {
  it("first sample shows immediately", () => {
    const it0 = new Interpolator();
    it0.push(1000, 50, 60, STATE.idle, DIR.down);
    const o = out();
    expect(it0.sample(1000, o)).toBe(true);
    expect([o.x, o.y]).toEqual([50, 60]);
  });

  it("never moves backwards across a skipped tick while walking", () => {
    // 6px/100ms로 걷는 중 한 틱(1300)이 빠지고 1400에 다음 샘플이 도착 (수신 지터 +5ms 포함)
    const ip = new Interpolator();
    const arrivals: [number, number][] = [[1000, 0], [1100, 6], [1200, 12], [1405, 24], [1500, 30], [1600, 36]];
    const o = out();
    let prevX = -Infinity;
    let next = 0;
    for (let now = 1000; now <= 1800; now += 4) {
      while (next < arrivals.length && arrivals[next][0] <= now) {
        ip.push(arrivals[next][0], arrivals[next][1], 0, STATE.walk, DIR.right);
        next++;
      }
      ip.sample(now, o);
      expect(o.x).toBeGreaterThanOrEqual(prevX - 1e-9);
      prevX = o.x;
    }
  });

  it("interpolates linearly with a 120ms delay", () => {
    const ip = new Interpolator();
    ip.push(1000, 0, 0, STATE.walk, DIR.right);
    ip.push(1100, 10, 0, STATE.walk, DIR.right);
    const o = out();
    ip.sample(1100 + INTERP_DELAY_MS - 50, o); // render time 1050 → halfway
    expect(o.x).toBeCloseTo(5, 5);
    expect(o.state).toBe(STATE.walk);
  });

  it("extrapolates up to 200ms then holds", () => {
    const ip = new Interpolator();
    ip.push(1000, 0, 0, STATE.walk, DIR.right);
    ip.push(1100, 10, 0, STATE.walk, DIR.right); // 0.1 px/ms
    const o = out();
    ip.sample(1100 + INTERP_DELAY_MS + 100, o); // 100ms past last sample
    expect(o.x).toBeCloseTo(20, 5);
    ip.sample(1100 + INTERP_DELAY_MS + 1000, o); // way past → capped at 200ms
    expect(o.x).toBeCloseTo(10 + 0.1 * EXTRAPOLATE_MAX_MS, 5);
  });

  it("does not extrapolate a stopped avatar", () => {
    const ip = new Interpolator();
    ip.push(1000, 0, 0, STATE.walk, DIR.right);
    ip.push(1100, 10, 0, STATE.idle, DIR.right);
    const o = out();
    ip.sample(5000, o);
    expect(o.x).toBe(10);
    expect(o.state).toBe(STATE.idle);
  });

  it("snaps on teleport (> 96px)", () => {
    const ip = new Interpolator();
    ip.push(1000, 0, 0, STATE.walk, DIR.right);
    ip.push(1100, 10, 0, STATE.walk, DIR.right);
    ip.push(1200, 300, 0, STATE.idle, DIR.down);
    const o = out();
    ip.sample(1200, o); // no delay for the snap
    expect(o.x).toBe(300);
  });

  it("starts smoothly after a long idle gap (delta snapshots)", () => {
    const ip = new Interpolator();
    ip.push(0, 100, 100, STATE.idle, DIR.down);
    ip.push(10_000, 105, 100, STATE.walk, DIR.right);
    const o = out();
    // 지연 시간 동안 원래 자리에서 천천히 출발해야지, 10초짜리 구간으로 늘어지면 안 된다
    ip.sample(10_000 + INTERP_DELAY_MS - 50, o);
    expect(o.x).toBeGreaterThan(100);
    expect(o.x).toBeLessThan(105);
    expect(o.state).toBe(STATE.walk);
  });

  it("shows walking while sliding into a stop/sit sample", () => {
    const ip = new Interpolator();
    ip.push(1000, 0, 0, STATE.walk, DIR.down);
    ip.push(1100, 0, 8, STATE.sitChair, DIR.left);
    const o = out();
    ip.sample(1100 + INTERP_DELAY_MS - 50, o);
    expect(o.state).toBe(STATE.walk);
    ip.sample(1100 + INTERP_DELAY_MS + 10, o);
    expect(o.state).toBe(STATE.sitChair);
    expect(o.y).toBe(8);
  });

  it("caps the buffer", () => {
    const ip = new Interpolator();
    for (let i = 0; i < 100; i++) ip.push(i * 100, i % 50, 0, STATE.walk, DIR.right);
    expect(ip.size).toBeLessThanOrEqual(32);
  });
});

describe("send throttle", () => {
  const pose = (x: number, state: number = STATE.walk) => ({ x, y: 10, state: state as 0, dir: DIR.right as 2 });

  it("sends the first pose", () => {
    expect(decideSend(0, pose(0), null, -Infinity, false)).toBe(true);
  });

  it("nothing while hidden", () => {
    expect(decideSend(0, pose(0), null, -Infinity, true)).toBe(false);
  });

  it("moving: at most 10Hz", () => {
    const th = new MoveThrottle();
    let sent = 0;
    for (let t = 0; t <= 1000; t += 16) {
      const p = pose(t / 10);
      if (th.shouldSend(t, p, false)) {
        th.markSent(t, p);
        sent++;
      }
    }
    expect(sent).toBeLessThanOrEqual(1000 / SEND_INTERVAL_MS + 1);
    expect(sent).toBeGreaterThanOrEqual(9);
  });

  it("state change waits for the 100ms gap, then goes out once with the latest state", () => {
    const th = new MoveThrottle();
    th.markSent(0, pose(10));
    // 30ms 뒤 달리기, 60ms 뒤 멈춤 → 100ms 전엔 아무것도, 100ms에 "멈춤" 한 번
    expect(th.shouldSend(30, pose(11, STATE.run), false)).toBe(false);
    expect(th.shouldSend(60, pose(12, STATE.idle), false)).toBe(false);
    const idle = pose(12, STATE.idle);
    expect(th.shouldSend(SEND_INTERVAL_MS, idle, false)).toBe(true);
    th.markSent(SEND_INTERVAL_MS, idle);
    for (let t = 120; t < 5000; t += 16) expect(th.shouldSend(t, idle, false)).toBe(false);
  });

  it("sitting does not send periodically", () => {
    const th = new MoveThrottle();
    const sit = pose(5, STATE.sitGround);
    th.markSent(0, sit);
    expect(th.shouldSend(10_000, sit, false)).toBe(false);
  });

  it("reset forces one send but still respects the 100ms gap", () => {
    const th = new MoveThrottle();
    const sit = pose(5, STATE.sitGround);
    th.markSent(0, sit);
    th.reset();
    expect(th.shouldSend(50, sit, false)).toBe(false);
    expect(th.shouldSend(100, sit, false)).toBe(true);
  });

  it("seq wraps at u16", () => {
    const th = new MoveThrottle();
    let seq = 0;
    for (let i = 0; i < 70_000; i++) seq = th.markSent(i * 100, pose(i));
    expect(seq).toBe(70_000 & 0xffff);
  });

  // 실제 입력 경로(키보드 연타·쉬프트 토글·조이스틱 떨림 → resolveMove → 상태 → 스로틀)를 흉내 내서
  // 어떤 프레임레이트에서도 MOVE 간격이 100ms 이상(≤10Hz)이고, 입력이 멈추면 마지막 상태가 반드시 나가는지 확인
  for (const fps of [30, 60, 144, 240]) {
    it(`mashing keys/shift/joystick at ${fps}fps never exceeds 10Hz`, () => {
      const rnd = mulberry(fps);
      const th = new MoveThrottle();
      const mv = emptyMove();
      const sends: number[] = [];
      let x = 300;
      let y = 300;
      let dir: DirId = DIR.down;
      let last: NetPose | null = null;
      const frame = 1000 / fps;
      const input = { ax: 0, ay: 0, run: false };
      const DURATION = 20_000;
      for (let t = 0; t < DURATION + 1000; t += frame) {
        if (t < DURATION) {
          const r = rnd();
          if (r < 0.15) input.run = !input.run; // 쉬프트 연타
          if (r > 0.7) {
            // 방향키 연타 (-1/0/1)
            input.ax = Math.floor(rnd() * 3) - 1;
            input.ay = Math.floor(rnd() * 3) - 1;
          } else if (r > 0.5) {
            // 데드존 경계에서 떨리는 조이스틱
            const m = 0.1 + rnd() * 0.15;
            const a = rnd() * Math.PI * 2;
            input.ax = Math.cos(a) * m;
            input.ay = Math.sin(a) * m;
          }
        } else {
          input.ax = input.ay = 0;
          input.run = false;
        }
        resolveMove(input, dir, mv);
        dir = mv.dir;
        x += (mv.vx * frame) / 1000;
        y += (mv.vy * frame) / 1000;
        const cur: NetPose = { x, y, state: mv.moving ? (mv.running ? STATE.run : STATE.walk) : STATE.idle, dir };
        if (th.shouldSend(t, cur, false)) {
          th.markSent(t, cur);
          sends.push(t);
          last = cur;
        }
      }
      for (let i = 1; i < sends.length; i++) expect(sends[i] - sends[i - 1]).toBeGreaterThanOrEqual(SEND_INTERVAL_MS - 1e-9);
      // 어느 1초 창에서도 10개 이하
      for (let i = 0; i < sends.length; i++) {
        let n = 0;
        for (let j = i; j < sends.length && sends[j] < sends[i] + 1000; j++) n++;
        expect(n).toBeLessThanOrEqual(10);
      }
      expect(sends.length).toBeGreaterThan(50);
      // 입력이 멈춘 뒤 마지막으로 나간 상태는 멈춤
      expect(last?.state).toBe(STATE.idle);
    });
  }
});

describe("backoff", () => {
  it("follows 0.5 → 1 → 2 → 4 → 8s with jitter", () => {
    const mid = [0, 1, 2, 3, 4, 5, 9].map((a) => backoffDelay(a, 0.5));
    expect(mid).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it("jitter stays within ±25% and never exceeds 8s", () => {
    for (let a = 0; a < 8; a++) {
      for (const r of [0, 0.25, 0.75, 0.999]) {
        const d = backoffDelay(a, r);
        expect(d).toBeLessThanOrEqual(BACKOFF_MAX_MS);
        expect(d).toBeGreaterThan(0);
      }
    }
    expect(backoffDelay(0, 0)).toBe(375);
    expect(backoffDelay(1, 0.999)).toBeLessThanOrEqual(1250);
  });
});

describe("join policy", () => {
  it("limits /api/join to 8 per minute", () => {
    const l = new JoinLimiter();
    let now = 0;
    const calls: number[] = [];
    while (now < 120_000) {
      const d = l.delay(now);
      if (d === 0) {
        l.record(now);
        calls.push(now);
        now += 500; // 아주 빠른 재시도
      } else now += d;
    }
    for (let i = 0; i < calls.length; i++) {
      const inWindow = calls.filter((t) => t >= calls[i] && t < calls[i] + JOIN_WINDOW_MS).length;
      expect(inWindow).toBeLessThanOrEqual(8);
    }
  });

  it("backoff reconnects in the first minute stay under 10 joins (token reuse + limiter)", () => {
    const l = new JoinLimiter();
    let cache: { channel: number; at: number; res: string } | null = null;
    let posts = 0;
    let now = 0;
    let attempt = 0;
    while (now < 60_000) {
      const tok = reusableToken(cache, 3, now);
      if (!tok) {
        now += l.delay(now);
        l.record(now);
        posts++;
        cache = { channel: 3, at: now, res: "t" };
      }
      now += backoffDelay(attempt++, 0.5); // 서버가 계속 거절한다고 가정
    }
    expect(posts).toBeLessThanOrEqual(10);
  });

  it("reuses a token only for the same channel and while fresh", () => {
    const c = { channel: 2, at: 1000, res: "tok" };
    expect(reusableToken(c, 2, 1000 + TOKEN_REUSE_MS - 1)).toBe("tok");
    expect(reusableToken(c, 2, 1000 + TOKEN_REUSE_MS)).toBeNull();
    expect(reusableToken(c, 3, 1500)).toBeNull();
    expect(reusableToken(c, "auto", 1500)).toBeNull();
  });

  it("400 is permanent, 429/5xx are retried", () => {
    expect(isPermanentJoinError(400)).toBe(true);
    expect(isPermanentJoinError(429)).toBe(false);
    expect(isPermanentJoinError(503)).toBe(false);
  });

  it("utf8Bytes counts multi-byte text frames", () => {
    expect(utf8Bytes("pong")).toBe(4);
    expect(utf8Bytes("가나")).toBe(6);
    expect(utf8Bytes("é")).toBe(2);
    expect(utf8Bytes("😀")).toBe(4);
  });
});
