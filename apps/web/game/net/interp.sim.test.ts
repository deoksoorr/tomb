import { describe, expect, it } from "vitest";
import { Interpolator } from "./Interpolator";
import { LegacyInterpolator } from "./legacyInterp";
import { PROFILES, simulateAvg, type SimMetrics } from "./netsim";

// 27번: 다른 사람 이동 끊김 — 같은 시뮬레이션(지연·지터·서버 틱·전송 간격)에서 예전 방식과 나란히 잰다.
// `npx vitest run game/net/interp.sim.test.ts --silent=false`로 표를 볼 수 있다.

const round = (m: SimMetrics) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));

describe("원격 보간: 예전 방식 대비 (네트워크 시뮬레이션)", () => {
  for (const name of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    it(`${name}: 더 매끄럽고 뒤로 밀리지 않는다`, () => {
      const old = simulateAvg(() => new LegacyInterpolator(), PROFILES[name]);
      const now = simulateAvg(() => new Interpolator(), PROFILES[name]);
      console.log(`[${name}] legacy`, JSON.stringify(round(old)));
      console.log(`[${name}] new   `, JSON.stringify(round(now)));
      expect(now.speedCv).toBeLessThan(old.speedCv * 0.75);
      expect(now.backFrames).toBe(0);
      expect(now.backFrames).toBeLessThanOrEqual(old.backFrames);
      expect(now.stallRatio).toBeLessThanOrEqual(old.stallRatio + 0.005);
      expect(now.endErr).toBeLessThan(0.5);
      expect(now.entries).toBe(old.entries); // 같은 트래픽
    });
  }
});
