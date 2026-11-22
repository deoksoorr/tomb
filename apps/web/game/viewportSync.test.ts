import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import { RESYNC_POLL_MS, installViewportSync, sizeOutOfSync } from "./viewportSync";

describe("sizeOutOfSync", () => {
  it("가로 크기에 멈춘 게임 vs 세로 부모 → 어긋남", () => {
    expect(sizeOutOfSync(390, 844, 844, 390)).toBe(true);
    expect(sizeOutOfSync(844, 390, 390, 844)).toBe(true);
  });
  it("주소창만 접혀 높이만 바뀌어도 어긋남", () => {
    expect(sizeOutOfSync(390, 760, 390, 844)).toBe(true);
  });
  it("같거나 1px 미만 차이(소수 부모 크기)는 그대로", () => {
    expect(sizeOutOfSync(390, 844, 390, 844)).toBe(false);
    expect(sizeOutOfSync(390.4, 843.6, 390.4, 843.6)).toBe(false);
    expect(sizeOutOfSync(390.4, 844, 390, 844)).toBe(false);
  });
  it("부모가 접혀 0이면 맞추지 않는다 (게임은 최소 1×1)", () => {
    expect(sizeOutOfSync(0, 0, 1, 1)).toBe(false);
    expect(sizeOutOfSync(390, 0, 390, 844)).toBe(false);
  });
});

/** Phaser ScaleManager 흉내: 방향 리스너가 parentSize를 먼저 새 크기로 적어 버려 자기 점검으로는 다시 안 맞추는 상태 */
function fakeGame(parent: { w: number; h: number }) {
  const listeners = new Map<string, ((t: number, d: number) => void)[]>();
  const sm = {
    width: 844,
    height: 390,
    parentSize: { width: parent.w, height: parent.h },
    canvas: {},
    parent: { getBoundingClientRect: () => ({ width: parent.w, height: parent.h }) },
    getParentBounds: vi.fn(() => {
      sm.parentSize = { width: parent.w, height: parent.h };
      return false;
    }),
    refresh: vi.fn(() => {
      sm.width = sm.parentSize.width;
      sm.height = sm.parentSize.height;
    }),
  };
  const game = {
    scale: sm,
    isRunning: true,
    loop: { running: true },
    events: {
      on: (k: string, f: (t: number, d: number) => void) => listeners.set(k, [...(listeners.get(k) ?? []), f]),
      off: (k: string, f: (t: number, d: number) => void) => listeners.set(k, (listeners.get(k) ?? []).filter((x) => x !== f)),
    },
  };
  const step = (delta: number) => listeners.get("prestep")?.forEach((f) => f(0, delta));
  return { game: game as unknown as Phaser.Game, sm, step, listeners, raw: game };
}

describe("installViewportSync", () => {
  const win = new EventTarget();
  const vv = new EventTarget();
  const orient = new EventTarget();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", Object.assign(win, { visualViewport: vv }));
    vi.stubGlobal("screen", { orientation: orient });
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 16) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("회전 이벤트 뒤 예전 크기에 멈춘 게임을 실제 부모 크기로 다시 맞춘다", () => {
    const parent = { w: 390, h: 844 };
    const { game, sm } = fakeGame(parent);
    const off = installViewportSync(game);
    orient.dispatchEvent(new Event("change"));
    vi.advanceTimersByTime(20);
    expect(sm.refresh).toHaveBeenCalledTimes(1);
    expect([sm.width, sm.height]).toEqual([390, 844]);
    // 이미 맞았으면 뒤 점검(150·450ms)은 아무것도 하지 않는다
    vi.advanceTimersByTime(500);
    expect(sm.refresh).toHaveBeenCalledTimes(1);
    off();
  });

  it("iOS: 중간 크기가 먼저 오고 최종 크기가 늦게 자리 잡아도 뒤 점검이 따라간다", () => {
    const parent = { w: 390, h: 390 };
    const { game, sm } = fakeGame(parent);
    const off = installViewportSync(game);
    win.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(20);
    expect([sm.width, sm.height]).toEqual([390, 390]);
    parent.h = 844; // 이벤트 없이 크기만 바뀜
    vi.advanceTimersByTime(200);
    expect([sm.width, sm.height]).toEqual([390, 844]);
    off();
  });

  it("이벤트를 못 받아도 게임 루프 점검(0.5초)이 맞춘다", () => {
    const { game, sm, step } = fakeGame({ w: 390, h: 844 });
    const off = installViewportSync(game);
    step(RESYNC_POLL_MS - 100);
    expect(sm.refresh).not.toHaveBeenCalled();
    step(100);
    expect([sm.width, sm.height]).toEqual([390, 844]);
    off();
  });

  it("루프가 잠든 동안엔 맞추지 않고(그림이 지워진다), 정리하면 리스너를 모두 뗀다", () => {
    const { game, sm, raw, listeners } = fakeGame({ w: 390, h: 844 });
    raw.loop.running = false;
    const off = installViewportSync(game);
    win.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(600);
    expect(sm.refresh).not.toHaveBeenCalled();
    off();
    raw.loop.running = true;
    win.dispatchEvent(new Event("resize"));
    vv.dispatchEvent(new Event("resize"));
    orient.dispatchEvent(new Event("change"));
    vi.advanceTimersByTime(600);
    expect(sm.refresh).not.toHaveBeenCalled();
    expect(listeners.get("prestep")).toEqual([]);
  });
});
