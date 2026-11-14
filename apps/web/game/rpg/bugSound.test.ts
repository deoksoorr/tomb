import { describe, expect, it } from "vitest";
import { bugSound, type BugSoundEv } from "./bugSound";
import { soundEnd, soundSignature } from "./skillSound";

// 32번 곤충 채집 합성음 설계 검사: 모든 사건에 소리가 있고, 짧고, 음량이 넘치지 않으며,
// 곤충마다·콤보 단계마다 소리가 다르다.

const EVS: BugSoundEv[] = ["catch", "golden", "bee", "leaf", "whiff", "escape", "tier", "ready", "go", "end"];

describe("곤충 채집 소리", () => {
  it("모든 사건에 소리가 있고 짧다 (1.2초 안), 겹마다 음량 0..0.4", () => {
    for (const ev of EVS) {
      const ls = bugSound(ev, { tier: 2, combo: 7, art: "butterfly" });
      expect(ls.length, ev).toBeGreaterThan(0);
      expect(soundEnd(ls), ev).toBeLessThanOrEqual(1.2);
      for (const l of ls) {
        expect(l.gain).toBeGreaterThan(0);
        expect(l.gain).toBeLessThanOrEqual(0.4);
        expect(l.dur).toBeGreaterThan(0);
        expect(l.at).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("곤충마다 잡는 소리가 다르다", () => {
    const sigs = (["butterfly", "dragonfly", "firefly"] as const).map((art) => soundSignature(bugSound("catch", { art, combo: 1 })));
    expect(new Set(sigs).size).toBe(3);
  });

  it("콤보가 이어지면 음이 올라가고, 단계가 오르면 반짝이 겹이 는다", () => {
    const f = (combo: number) => Math.max(...bugSound("catch", { art: "butterfly", combo }).map((l) => (l.wave === "triangle" ? (l.f0 ?? 0) : 0)));
    expect(f(2)).toBeGreaterThan(f(1));
    expect(f(4)).toBeGreaterThan(f(2));
    expect(bugSound("catch", { tier: 3 }).length).toBeGreaterThan(bugSound("catch", { tier: 0 }).length);
  });

  it("콤보 단계 화음은 단계가 높을수록 높다", () => {
    const low = Math.min(...bugSound("tier", { tier: 1 }).map((l) => l.f0 ?? 0));
    const high = Math.min(...bugSound("tier", { tier: 4 }).map((l) => l.f0 ?? 0));
    expect(high).toBeGreaterThan(low);
  });
});
