import { describe, expect, it } from "vitest";
import { slideRidePose, slideTimeline, SLIDE_RIDE_MS } from "./campPlayPath";
import { runFreq, runGain } from "./slideSynth";
import { endRemoteSlide, slideCuesBetween, slideRunSpeed, slideSpeed01, slideVoiceOf, SLIDE_TOP_SPEED, trackRemoteSlide, type RemoteSlidePhase, type RemoteSlideTrack } from "./slideSoundPlan";

// 11/26 미끄럼 효과음: 컨셉별 소리 고르기 · 내가 탈 때 박자 · 빠르기 따라가기 · 다른 사람이 탈 때 보이는 자리로 같은 소리

/** 한 번 타는 동안 16ms마다 나는 한 번 소리 (시각과 함께) */
function cuesOfRide(snowy: boolean): { cue: string; t: number }[] {
  const out: { cue: string; t: number }[] = [];
  let prev = -1;
  for (let t = 16; t < SLIDE_RIDE_MS; t += 16) {
    for (const cue of slideCuesBetween(prev, t, snowy)) out.push({ cue, t });
    prev = t;
  }
  return out;
}

describe("컨셉별 소리", () => {
  it("겨울·크리스마스는 눈썰매(크리스마스만 방울), 기본은 워터 슬라이드", () => {
    expect(slideVoiceOf("default")).toEqual({ kind: "water", bells: false });
    expect(slideVoiceOf("winter")).toEqual({ kind: "sled", bells: false });
    expect(slideVoiceOf("christmas")).toEqual({ kind: "sled", bells: true });
  });
});

describe("내가 탈 때 박자", () => {
  for (const snowy of [true, false]) {
    const name = snowy ? "눈썰매" : "워터 슬라이드";
    it(`${name}: 오르기 → 앉기 → 닿기가 한 번씩 차례로`, () => {
      const cues = cuesOfRide(snowy);
      expect(cues.map((c) => c.cue)).toEqual(["climb", "sit", "land"]);
      const tl = slideTimeline(snowy);
      expect(cues[0].t).toBeLessThan(100);
      expect(Math.abs(cues[1].t - tl.sitAt)).toBeLessThanOrEqual(16);
      expect(Math.abs(cues[2].t - tl.endAt)).toBeLessThanOrEqual(16);
    });
    it(`${name}: 닿는 때가 그림과 맞다 (워터는 풀에 빠지는 순간, 눈썰매는 언덕 밑에 멈춘 뒤)`, () => {
      const tl = slideTimeline(snowy);
      expect(slideRidePose(tl.endAt + 1, snowy).inPool).toBe(!snowy);
      if (snowy) {
        const a = slideRidePose(tl.endAt + 1, snowy);
        const b = slideRidePose(tl.endAt + 200, snowy);
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBe(0);
      }
    });
    it(`${name}: 루프는 미끄러지는 동안만, 갈수록 빨라진다`, () => {
      const tl = slideTimeline(snowy);
      expect(slideRunSpeed(tl.startAt - 1, snowy)).toBe(0);
      expect(slideRunSpeed(tl.endAt, snowy)).toBe(0);
      expect(slideRunSpeed(500, snowy)).toBe(0);
      const early = slideRunSpeed(tl.startAt + 50, snowy);
      const late = slideRunSpeed(tl.endAt - 60, snowy);
      expect(early).toBeGreaterThan(0.2);
      expect(late).toBeGreaterThan(early);
      expect(late).toBeLessThanOrEqual(1);
    });
  }
  it("프레임이 크게 끊기면(탭을 숨겼다 돌아옴) 밀린 소리를 한꺼번에 내지 않는다", () => {
    expect(slideCuesBetween(100, 3000, true)).toEqual([]);
    expect(slideCuesBetween(-1, 16, true)).toEqual(["climb"]);
  });
});

describe("소리 크기·높이 (빠를수록 크고 높게, 아주 작게)", () => {
  for (const kind of ["sled", "water"] as const) {
    it(kind, () => {
      expect(runGain(kind, 0, 1)).toBe(0);
      expect(runGain(kind, 1, 1)).toBeGreaterThan(runGain(kind, 1, 0.3));
      expect(runGain(kind, 1, 1)).toBeLessThanOrEqual(0.2);
      expect(runGain(kind, 0.5, 1)).toBeCloseTo(runGain(kind, 1, 1) / 2);
      expect(runFreq(kind, 1)).toBeGreaterThan(runFreq(kind, 0));
      expect(runGain(kind, 5, 5)).toBe(runGain(kind, 1, 1));
    });
  }
  it("빠르기 정규화", () => {
    expect(SLIDE_TOP_SPEED.sled).toBeGreaterThan(40);
    expect(SLIDE_TOP_SPEED.water).toBeGreaterThan(40);
    expect(slideSpeed01(SLIDE_TOP_SPEED.sled * 2, "sled")).toBe(1);
    expect(slideSpeed01(Number.NaN, "water")).toBe(0);
  });
});

/** 다른 사람의 한 번 타기를 그 사람 자리로 흉내 낸다 (CampPlay.remoteSlideAlt와 같은 갈래) */
function remoteRide(snowy: boolean, from = 0): { cues: { cue: string; t: number }[]; runMax: number; runAt: number[]; track: RemoteSlideTrack | null } {
  const kind = snowy ? "sled" : "water";
  const cues: { cue: string; t: number }[] = [];
  let track: RemoteSlideTrack | null = null;
  let runMax = 0;
  const runAt: number[] = [];
  for (let t = from; t < SLIDE_RIDE_MS; t += 16) {
    const p = slideRidePose(t, snowy);
    const phase: RemoteSlidePhase = p.alt === "swim" ? "pool" : p.alt === "walk" || p.alt === "idle" ? "climb" : "ride";
    const step = trackRemoteSlide(track, p.x, p.y, phase, 16, kind);
    track = step.track;
    for (const cue of step.cues) cues.push({ cue, t });
    if (step.run > 0) runAt.push(t);
    runMax = Math.max(runMax, step.run);
  }
  return { cues, runMax, runAt, track };
}

describe("다른 사람이 탈 때 (보이는 자리로)", () => {
  for (const snowy of [true, false]) {
    const name = snowy ? "눈썰매" : "워터 슬라이드";
    it(`${name}: 내 박자와 거의 같은 때 오르기·앉기·닿기, 루프는 내려가는 동안만`, () => {
      const { cues, runMax, runAt } = remoteRide(snowy);
      expect(cues.map((c) => c.cue)).toEqual(["climb", "sit", "land"]);
      const tl = slideTimeline(snowy);
      // 앉기: 꼭대기에서 출발점으로 옮겨 앉는 사이 (오르기 끝 ~ 앉는 때)
      expect(cues[1].t).toBeGreaterThanOrEqual(1100);
      expect(cues[1].t).toBeLessThanOrEqual(tl.sitAt + 16);
      // 닿기: 내 박자와 0.25초 안
      expect(Math.abs(cues[2].t - tl.endAt)).toBeLessThan(250);
      expect(runMax).toBeGreaterThan(0.5);
      expect(Math.min(...runAt)).toBeGreaterThanOrEqual(tl.startAt);
      expect(Math.max(...runAt)).toBeLessThan(tl.endAt + 120);
    });
  }
  it("맵에 들어와 보니 이미 내려가는 중이면 오르기·앉기 소리 없이 따라가다 닿기", () => {
    const tl = slideTimeline(true);
    const { cues } = remoteRide(true, tl.startAt + 500);
    expect(cues.map((c) => c.cue)).toEqual(["land"]);
  });
  it("내려가다 자리에서 빠지면(끊김) 닿는 소리 한 번, 이미 닿았으면 없음", () => {
    const tl = slideTimeline(true);
    const mid = remoteRide(true, 0);
    expect(endRemoteSlide(mid.track)).toEqual([]);
    let track: RemoteSlideTrack | null = null;
    for (let t = 0; t < tl.startAt + 400; t += 16) {
      const p = slideRidePose(t, true);
      track = trackRemoteSlide(track, p.x, p.y, p.alt === "walk" || p.alt === "idle" ? "climb" : "ride", 16, "sled").track;
    }
    expect(endRemoteSlide(track)).toEqual(["land"]);
    expect(endRemoteSlide(null)).toEqual([]);
  });
  it("순간이동처럼 크게 튀면 빠르기를 다시 잰다 (루프가 갑자기 크게 나지 않게)", () => {
    const a = trackRemoteSlide(null, 250, 470, "ride", 16, "sled");
    const b = trackRemoteSlide(a.track, 250, 520, "ride", 16, "sled");
    expect(b.track.speed).toBe(0);
    expect(b.run).toBe(0);
  });
});
