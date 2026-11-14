import { describe, expect, it } from "vitest";
import { BACKGROUND_DELAY_MS, BackgroundWatch, type BackgroundEnv } from "./background";

/** 시계·포커스·숨김·이벤트를 손으로 움직이는 가짜 브라우저 */
function fake() {
  let now = 0;
  let hidden = false;
  let focus = true;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let seq = 0;
  const handlers = new Map<string, Set<() => void>>();
  const env: BackgroundEnv = {
    hidden: () => hidden,
    hasFocus: () => focus,
    now: () => now,
    setTimeout: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => void timers.delete(id as number),
    on(target, type, fn) {
      const k = `${target}:${type}`;
      const set = handlers.get(k) ?? new Set();
      set.add(fn);
      handlers.set(k, set);
      return () => set.delete(fn);
    },
  };
  const fire = (k: string) => handlers.get(k)?.forEach((fn) => fn());
  return {
    env,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at))
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
    },
    blur() {
      focus = false;
      fire("window:blur");
    },
    focus() {
      focus = true;
      fire("window:focus");
    },
    hide(h: boolean) {
      hidden = h;
      fire("document:visibilitychange");
    },
    input(type = "pointermove") {
      fire(`window:${type}`);
    },
  };
}

describe("뒤로 간 상태 판정 (lib/background)", () => {
  it("포커스를 잃고 5초가 지나야 뒤로, 포커스가 돌아오면 바로 앞으로", () => {
    const f = fake();
    const w = new BackgroundWatch(f.env);
    const seen: boolean[] = [];
    w.subscribe((bg) => seen.push(bg));
    expect(w.background).toBe(false);
    f.blur();
    f.advance(BACKGROUND_DELAY_MS - 1);
    expect(w.background).toBe(false);
    f.advance(1);
    expect(w.background).toBe(true);
    f.focus();
    expect(w.background).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("포커스 없이 포인터·키 입력이 오면 바로 앞으로, 그때부터 다시 5초를 센다", () => {
    const f = fake();
    const w = new BackgroundWatch(f.env);
    w.start();
    f.blur();
    f.advance(BACKGROUND_DELAY_MS);
    expect(w.background).toBe(true);
    f.input("pointermove");
    expect(w.background).toBe(false);
    f.advance(BACKGROUND_DELAY_MS - 1000);
    f.input("keydown"); // 입력이 오면 다시 센다
    f.advance(BACKGROUND_DELAY_MS - 1);
    expect(w.background).toBe(false);
    f.advance(1);
    expect(w.background).toBe(true);
  });

  it("포커스를 잃었다가 5초 안에 돌아오면 뒤로 가지 않는다", () => {
    const f = fake();
    const w = new BackgroundWatch(f.env);
    const seen: boolean[] = [];
    w.subscribe((bg) => seen.push(bg));
    f.blur();
    f.advance(BACKGROUND_DELAY_MS - 1000);
    f.focus();
    f.advance(BACKGROUND_DELAY_MS * 2);
    expect(seen).toEqual([]);
  });

  it("탭을 숨기면 바로 뒤로, 다시 보이면(포커스 있음) 바로 앞으로. 보이는데 포커스가 없으면 다시 5초", () => {
    const f = fake();
    const w = new BackgroundWatch(f.env);
    w.start();
    f.hide(true);
    expect(w.background).toBe(true);
    f.hide(false);
    expect(w.background).toBe(false);
    f.blur();
    f.hide(true);
    expect(w.background).toBe(true);
    f.hide(false); // 다른 창이 앞이라 포커스 없음
    expect(w.background).toBe(false);
    f.advance(BACKGROUND_DELAY_MS);
    expect(w.background).toBe(true);
  });

  it("처음부터 포커스가 없으면 5초 뒤 뒤로", () => {
    const f = fake();
    f.blur();
    const w = new BackgroundWatch(f.env);
    expect(w.background).toBe(false);
    f.advance(BACKGROUND_DELAY_MS);
    expect(w.background).toBe(true);
  });
});
