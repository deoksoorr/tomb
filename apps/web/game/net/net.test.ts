import { describe, expect, it } from "vitest";
import { DIR, EXTRAPOLATE_MAX_MS, INTERP_DELAY_MS, SEND_INTERVAL_MS, STATE } from "@tomb/protocol";
import { BACKOFF_MAX_MS, backoffDelay } from "./backoff";
import { Interpolator, type InterpOut } from "./Interpolator";
import { MoveThrottle, STATE_CHANGE_GAP_MS, decideSend } from "./sendThrottle";

const out = (): InterpOut => ({ x: 0, y: 0, state: STATE.idle, dir: DIR.down });

describe("Interpolator", () => {
  it("first sample shows immediately", () => {
    const it0 = new Interpolator();
    it0.push(1000, 50, 60, STATE.idle, DIR.down);
    const o = out();
    expect(it0.sample(1000, o)).toBe(true);
    expect([o.x, o.y]).toEqual([50, 60]);
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
    expect(decideSend(0, pose(0), null, false)).toBe(true);
  });

  it("nothing while hidden", () => {
    expect(decideSend(0, pose(0), null, true)).toBe(false);
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

  it("state change goes out immediately, exactly once, then silence while idle", () => {
    const th = new MoveThrottle();
    th.markSent(0, pose(10));
    const idle = pose(12, STATE.idle);
    expect(th.shouldSend(STATE_CHANGE_GAP_MS, idle, false)).toBe(true);
    th.markSent(STATE_CHANGE_GAP_MS, idle);
    for (let t = 100; t < 5000; t += 16) expect(th.shouldSend(t, idle, false)).toBe(false);
  });

  it("sitting does not send periodically", () => {
    const th = new MoveThrottle();
    const sit = pose(5, STATE.sitGround);
    th.markSent(0, sit);
    expect(th.shouldSend(10_000, sit, false)).toBe(false);
  });

  it("reset forces one send (tab return / reconnect)", () => {
    const th = new MoveThrottle();
    const sit = pose(5, STATE.sitGround);
    th.markSent(0, sit);
    th.reset();
    expect(th.shouldSend(1, sit, false)).toBe(true);
  });

  it("seq wraps at u16", () => {
    const th = new MoveThrottle();
    let seq = 0;
    for (let i = 0; i < 70_000; i++) seq = th.markSent(i, pose(i));
    expect(seq).toBe(70_000 & 0xffff);
  });
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
