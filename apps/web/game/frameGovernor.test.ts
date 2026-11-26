import { describe, expect, it } from "vitest";
import {
  ActivityClock,
  cameraMoved,
  FrameGate,
  INPUT_HOLD_MS,
  StutterWatch,
  STUTTER_WINDOW_MS,
  STUTTER_WINDOWS,
  targetFps,
} from "./frameGovernor";
import { coversMost } from "@/lib/gameCover";
import { parseDeviceSettings } from "@/lib/deviceSettings";
import { escOpensSettings, type EscState } from "@/components/overlay/settingsEsc";

/** hz 화면에서 ms 동안 rAF를 돌려 실제로 돈 프레임 수 (흔들림 jitter ms) */
function run(gate: FrameGate, hz: number, ms: number, fps: number | null, jitter = 0, start = 1000): { runs: number; delta: number } {
  const step = 1000 / hz;
  let runs = 0;
  let delta = 0;
  let prev = start;
  for (let i = 1; i <= Math.round(ms / step); i++) {
    const j = jitter ? (i % 2 ? jitter : -jitter) : 0;
    const t = start + i * step + j;
    const p = gate.plan(t, t - prev, fps);
    prev = t;
    if (p.run) {
      runs++;
      delta += p.delta;
    }
  }
  return { runs, delta };
}

describe("targetFps", () => {
  const base = { touch: false, powerSave: false, full: false, active: false };
  it("PC 절전 끔: 늘 화면 그대로 (일괄 30 없음)", () => {
    expect(targetFps(base)).toBeNull();
    expect(targetFps({ ...base, active: true })).toBeNull();
  });
  it("터치: 가만히 30, 움직이면 60", () => {
    expect(targetFps({ ...base, touch: true })).toBe(30);
    expect(targetFps({ ...base, touch: true, active: true })).toBe(60);
  });
  it("절전: 가만히 20, 움직이면 60 (PC도)", () => {
    expect(targetFps({ ...base, powerSave: true })).toBe(20);
    expect(targetFps({ ...base, touch: true, powerSave: true })).toBe(20);
    expect(targetFps({ ...base, powerSave: true, active: true })).toBe(60);
  });
  it("판 진행 중(사냥 등)은 손대지 않는다", () => {
    expect(targetFps({ touch: true, powerSave: true, full: true, active: false })).toBeNull();
  });
});

describe("FrameGate", () => {
  it("60Hz에서 30 → 초당 30번, 흐른 시간은 모아서", () => {
    const r = run(new FrameGate(), 60, 1000, 30);
    expect(r.runs).toBeGreaterThanOrEqual(29);
    expect(r.runs).toBeLessThanOrEqual(31);
    // 마지막 건너뛴 프레임 몫은 다음 번에 넘어간다 (잃지 않는다)
    expect(r.delta).toBeGreaterThanOrEqual(1000 - 1000 / 30 - 0.01);
    expect(r.delta).toBeLessThanOrEqual(1000.01);
  });
  it("rAF 시각이 1ms 흔들려도 30이 20으로 떨어지지 않는다", () => {
    const r = run(new FrameGate(), 60, 2000, 30, 1);
    expect(r.runs).toBeGreaterThanOrEqual(58);
  });
  it("60Hz에서 20 → 20번", () => {
    const r = run(new FrameGate(), 60, 1000, 20);
    expect(r.runs).toBeGreaterThanOrEqual(19);
    expect(r.runs).toBeLessThanOrEqual(21);
  });
  it("120Hz 화면도 60으로", () => {
    const r = run(new FrameGate(), 120, 1000, 60);
    expect(r.runs).toBeGreaterThanOrEqual(58);
    expect(r.runs).toBeLessThanOrEqual(61);
  });
  it("90Hz 화면에서 60 → 45로 떨어지지 않는다", () => {
    const r = run(new FrameGate(), 90, 1000, 60);
    expect(r.runs).toBeGreaterThanOrEqual(55);
  });
  it("제한 없음이면 매 프레임", () => {
    expect(run(new FrameGate(), 60, 1000, null).runs).toBe(60);
  });
  it("목표가 바뀌면(움직이기 시작) 바로 다음 프레임에 돈다", () => {
    const g = new FrameGate();
    expect(g.plan(1000, 16, 30).run).toBe(true);
    expect(g.plan(1016.7, 16.7, 30).run).toBe(false);
    expect(g.plan(1020, 3.3, 60).run).toBe(true);
  });
  it("오래 멈췄다 깨면 몰아서 따라잡지 않는다", () => {
    const g = new FrameGate();
    g.plan(1000, 16, 30);
    expect(g.plan(5000, 4000, 30).run).toBe(true);
    expect(g.plan(5016.7, 16.7, 30).run).toBe(false);
  });
});

describe("ActivityClock", () => {
  it("입력 뒤 잠깐, 키를 누르고 있는 동안은 계속 움직이는 중", () => {
    const c = new ActivityClock();
    expect(c.active(0)).toBe(false);
    c.poke(100, INPUT_HOLD_MS);
    expect(c.active(100 + INPUT_HOLD_MS - 1)).toBe(true);
    expect(c.active(100 + INPUT_HOLD_MS + 1)).toBe(false);
    c.keyDown("KeyW", 5000);
    expect(c.active(60_000)).toBe(true);
    c.keyUp("KeyW", 60_000);
    expect(c.active(60_000 + INPUT_HOLD_MS + 1)).toBe(false);
  });
  it("창이 포커스를 잃으면 누른 키를 잊는다", () => {
    const c = new ActivityClock();
    c.keyDown("KeyA", 0);
    c.releaseKeys();
    expect(c.active(INPUT_HOLD_MS + 1)).toBe(false);
  });
});

describe("cameraMoved", () => {
  it("아주 작은 흔들림은 무시", () => {
    expect(cameraMoved([10, 10, 3], [10.001, 10, 3])).toBe(false);
    expect(cameraMoved([10, 10, 3], [10.5, 10, 3])).toBe(true);
    expect(cameraMoved([10, 10, 3], [10, 10, 3.5])).toBe(true);
  });
});

describe("StutterWatch", () => {
  const feed = (w: StutterWatch, fps: number, ms: number) => {
    let fired = 0;
    for (let t = 0; t < ms; t += 1000 / fps) if (w.sample(1000 / fps)) fired++;
    return fired;
  };
  it("움직이는 중 20초 넘게 40fps 아래면 한 번만", () => {
    const w = new StutterWatch();
    expect(feed(w, 25, STUTTER_WINDOW_MS * STUTTER_WINDOWS + 500)).toBe(1);
    expect(feed(w, 25, 60_000)).toBe(0);
  });
  it("잠깐 버벅인 것(빠른 창이 끼면)은 안내하지 않는다", () => {
    const w = new StutterWatch();
    feed(w, 25, STUTTER_WINDOW_MS * (STUTTER_WINDOWS - 1) + 100);
    feed(w, 60, STUTTER_WINDOW_MS + 100);
    expect(feed(w, 25, STUTTER_WINDOW_MS * (STUTTER_WINDOWS - 1))).toBe(0);
  });
  it("매끄러우면 안내 없음, 긴 멈춤(탭 전환)은 세지 않는다", () => {
    const w = new StutterWatch();
    expect(feed(w, 58, 120_000)).toBe(0);
    for (let i = 0; i < 100; i++) expect(w.sample(2000)).toBe(false);
  });
});

describe("coversMost (큰 창이면 뒤 마을 8fps)", () => {
  it("폰 화면 전체 창·데스크톱 표준 창은 덮음, 확인 창은 아님", () => {
    expect(coversMost(390, 844, 390, 844)).toBe(true);
    expect(coversMost(760, 660, 1280, 800)).toBe(true);
    expect(coversMost(360, 200, 1280, 800)).toBe(false);
    expect(coversMost(0, 0, 1280, 800)).toBe(false);
  });
});

describe("parseDeviceSettings", () => {
  it("없거나 깨졌으면 기본값 (날씨 켬·절전 끔)", () => {
    expect(parseDeviceSettings(null)).toEqual({ weather: true, powerSave: false });
    expect(parseDeviceSettings("{깨짐")).toEqual({ weather: true, powerSave: false });
    expect(parseDeviceSettings('{"weather":false,"powerSave":true,"x":1}')).toEqual({ weather: false, powerSave: true });
    expect(parseDeviceSettings('{"weather":"no"}')).toEqual({ weather: true, powerSave: false });
  });
});

describe("escOpensSettings", () => {
  const quiet: EscState = { plainEsc: true, shellQuiet: true, editable: false, dialogOpen: false, expanded: false, bigMap: false, keysBlocked: false, guiding: false };
  it("아무것도 없을 때만 연다", () => {
    expect(escOpensSettings(quiet)).toBe(true);
  });
  it("창·입력칸·큰 지도·길 안내·펼친 칸 등 다른 Esc 몫이 있으면 열지 않는다", () => {
    for (const k of ["editable", "dialogOpen", "expanded", "bigMap", "keysBlocked", "guiding"] as const) expect(escOpensSettings({ ...quiet, [k]: true })).toBe(false);
    expect(escOpensSettings({ ...quiet, shellQuiet: false })).toBe(false);
    expect(escOpensSettings({ ...quiet, plainEsc: false })).toBe(false);
  });
});
