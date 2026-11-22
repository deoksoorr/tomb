import { describe, expect, it } from "vitest";
import { BACKGROUND_FPS, BackgroundStepper, COVERED_FPS, LoopController, loopMode } from "./backgroundStepper";

const FRAME = 1000 / 60;
const STEP = 1000 / BACKGROUND_FPS;

/** 60fps로 ms 동안 돌린 결과: 갱신 횟수·그리기 횟수·넘긴 시간 합 */
function run(live: boolean, ms: number, fps?: number) {
  const s = new BackgroundStepper(fps);
  let updates = 0;
  let renders = 0;
  let total = 0;
  for (let t = FRAME; t <= ms + 1e-6; t += FRAME) {
    const p = s.plan(t, FRAME, live);
    if (p.kind === "full") {
      updates++;
      renders++;
      total += p.delta;
    } else if (p.kind === "update") {
      updates++;
      total += p.delta;
    }
  }
  return { updates, renders, total };
}

describe("뒤로 간 동안 게임 루프 줄이기 (BackgroundStepper)", () => {
  it("마을: 초당 5번만 갱신·그리기, 흐른 시간은 모아서 넘겨 게임 시계가 그대로 간다", () => {
    const r = run(false, 10_000);
    expect(r.renders).toBeGreaterThanOrEqual(10 * BACKGROUND_FPS - 1);
    expect(r.renders).toBeLessThanOrEqual(10 * BACKGROUND_FPS + 1);
    expect(r.updates).toBe(r.renders);
    // 마지막 묶음(아직 넘기지 않은 몫)만큼만 모자란다
    expect(10_000 - r.total).toBeLessThan(STEP);
  });

  it("사냥 판 진행 중: 갱신은 매 프레임(판 시계 그대로), 그리기만 초당 5번", () => {
    const r = run(true, 10_000);
    expect(r.updates).toBe(600);
    expect(r.renders).toBeGreaterThanOrEqual(10 * BACKGROUND_FPS - 1);
    expect(r.renders).toBeLessThanOrEqual(10 * BACKGROUND_FPS + 1);
    expect(Math.abs(r.total - 10_000)).toBeLessThan(1);
  });
});

describe("11/22 창이 마을을 덮은 동안 (covered)", () => {
  it("갱신은 매 프레임(네트워크·위치·시간 그대로), 그리기만 초당 COVERED_FPS번 남짓 (60Hz에선 8프레임마다 = 7.5번)", () => {
    const r = run(true, 10_000, COVERED_FPS);
    expect(r.updates).toBe(600);
    expect(r.renders).toBeGreaterThanOrEqual(10 * COVERED_FPS * 0.9);
    expect(r.renders).toBeLessThanOrEqual(10 * COVERED_FPS + 1);
    expect(Math.abs(r.total - 10_000)).toBeLessThan(1);
  });

  it("loopMode: 앞에서 덮이면 covered, 뒤로 가면 덮임과 상관없이 예전 규칙", () => {
    expect(loopMode(false, false, true)).toBe("covered");
    expect(loopMode(false, true, true)).toBe("covered");
    expect(loopMode(true, false, true)).toBe("rest");
    expect(loopMode(true, true, true)).toBe("live");
    expect(loopMode(false, false)).toBe("normal");
  });

  it("덮이면 켜고, 창이 닫히면 바로 끈다. 덮인 채 뒤로 가면 덮임을 끄고 휴식, 돌아오면 다시 덮임", () => {
    const st = { bg: false, covered: false };
    const log: string[] = [];
    const ctl = new LoopController({
      started: () => true,
      background: () => st.bg,
      live: () => false,
      sleep: () => log.push("sleep"),
      wake: () => log.push("wake"),
      enterLive: () => log.push("live+"),
      leaveLive: () => log.push("live-"),
      covered: () => st.covered,
      enterCovered: () => log.push("cover+"),
      leaveCovered: () => log.push("cover-"),
      rest: (on) => log.push(on ? "rest" : "awake"),
    });
    st.covered = true;
    ctl.apply();
    expect(log).toEqual(["cover+", "awake"]);
    st.bg = true;
    ctl.apply();
    expect(log.slice(-3)).toEqual(["cover-", "sleep", "rest"]);
    st.bg = false;
    ctl.apply();
    expect(log.slice(-3)).toEqual(["wake", "cover+", "awake"]);
    st.covered = false;
    ctl.apply();
    expect(log.slice(-2)).toEqual(["cover-", "awake"]);
    expect(ctl.mode).toBe("normal");
    st.covered = true;
    ctl.apply();
    ctl.dispose();
    expect(log.slice(-3)).toEqual(["cover+", "awake", "cover-"]);
  });
});

describe("휴식 중 루프 제어 (LoopController)", () => {
  function kit() {
    const st = { started: true, bg: false, live: false };
    const log: string[] = [];
    const ctl = new LoopController({
      started: () => st.started,
      background: () => st.bg,
      live: () => st.live,
      sleep: () => log.push("sleep"),
      wake: () => log.push("wake"),
      enterLive: () => log.push("live+"),
      leaveLive: () => log.push("live-"),
      rest: (on) => log.push(on ? "rest" : "awake"),
    });
    return { st, log, ctl };
  }

  it("loopMode: 앞이면 평소, 뒤인데 판 진행 중이면 live, 아니면 휴식", () => {
    expect(loopMode(false, true)).toBe("normal");
    expect(loopMode(true, true)).toBe("live");
    expect(loopMode(true, false)).toBe("rest");
  });

  it("뒤로 가면 루프를 재우고 휴식 막, 돌아오면 바로 깨우고 막을 걷는다", () => {
    const { st, log, ctl } = kit();
    st.bg = true;
    ctl.apply();
    expect(log).toEqual(["sleep", "rest"]);
    ctl.apply(); // 그대로면 아무것도 안 한다
    st.bg = false;
    ctl.apply();
    expect(log).toEqual(["sleep", "rest", "wake", "awake"]);
  });

  it("판 진행 중에는 재우지도 막을 띄우지도 않고, 판이 끝났는데 뒤에 있으면 그때 휴식", () => {
    const { st, log, ctl } = kit();
    st.bg = true;
    st.live = true;
    ctl.apply();
    expect(log).toEqual(["live+", "awake"]);
    st.live = false; // 판이 끝남
    ctl.apply();
    expect(log).toEqual(["live+", "awake", "live-", "sleep", "rest"]);
    st.bg = false;
    ctl.apply();
    expect(log.slice(-2)).toEqual(["wake", "awake"]);
  });

  it("루프가 시작되기 전(부팅 중)에는 건드리지 않는다. 정리하면 재운 루프를 깨운다", () => {
    const { st, log, ctl } = kit();
    st.started = false;
    st.bg = true;
    ctl.apply();
    expect(log).toEqual([]);
    st.started = true;
    ctl.apply();
    ctl.dispose();
    expect(log).toEqual(["sleep", "rest", "wake", "awake"]);
    expect(ctl.mode).toBe("normal");
  });
});
