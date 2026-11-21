import { describe, expect, it } from "vitest";
import { CHAIR_SND_GAP, CHAIR_SOUND_EVS, chairSound } from "./chairSound";
import { ALL_PATS, type KillId } from "./rules";

const KILLS: KillId[] = ["flip", "drop", "quit"];

describe("회장님 독대 효과음", () => {
  const evs = CHAIR_SOUND_EVS(ALL_PATS, KILLS);
  it("기술 18개 × (시전·터짐) + 즉사 3 × 2 + 변신·봉인·단계 전환·커피 일곱이 다 있다", () => {
    expect(evs).toHaveLength(18 * 2 + 3 * 2 + 7);
    for (const ev of evs) expect(chairSound(ev).length, ev).toBeGreaterThan(0);
  });
  it("소리마다 서로 다르다 (같은 묶음이 두 번 나오지 않는다)", () => {
    const seen = new Set(evs.map((ev) => JSON.stringify(chairSound(ev))));
    expect(seen.size).toBe(evs.length);
  });
  // 한 시각에 같이 울리는 겹의 음량 합 (가장 큰 때)
  const peak = (ls: ReturnType<typeof chairSound>) => Math.max(...ls.map((a) => ls.filter((l) => l.at <= a.at && a.at < l.at + l.dur).reduce((s, l) => s + l.gain, 0)));
  it("겹마다 0.32 아래 · 한꺼번에 울리는 합 0.75 아래 · 2.5초 안에 끝 (겹쳐도 귀가 아프지 않게)", () => {
    for (const ev of evs) {
      const ls = chairSound(ev);
      for (const l of ls) {
        expect(l.gain, ev).toBeLessThanOrEqual(0.32);
        expect(l.at + l.dur, ev).toBeLessThanOrEqual(2.5);
        expect(Number.isFinite(l.dur) && l.dur > 0, ev).toBe(true);
      }
      expect(peak(ls), ev).toBeLessThan(0.75);
    }
  });
  it("같은 소리는 0.1초 넘게 띄운다", () => expect(CHAIR_SND_GAP).toBeGreaterThanOrEqual(100));
});
