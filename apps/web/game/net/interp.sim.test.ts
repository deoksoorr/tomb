import { describe, expect, it } from "vitest";
import { MOVE_STEADY_MS } from "@tomb/protocol";
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

// 11/17 꾸준히 걷는 동안 MOVE를 MOVE_STEADY_MS 간격으로 줄여도(DO 요청 절약) 받는 쪽 움직임은 그대로 매끄러워야 한다.
// 늘어나는 것은 지연(버퍼가 도착 간격에 맞춰 길어짐)뿐이다.
describe("11/17 꾸준한 걷기 MOVE 간격 (MOVE_STEADY_MS)", () => {
  for (const name of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    it(`${name}: 받는 메시지는 20% 넘게 줄고 매끄러움은 같다`, () => {
      const base = simulateAvg(() => new Interpolator(), PROFILES[name]);
      const steady = simulateAvg(() => new Interpolator(), PROFILES[name], 6, MOVE_STEADY_MS);
      console.log(`[${name}] 100ms `, JSON.stringify(round(base)));
      console.log(`[${name}] steady`, JSON.stringify(round(steady)));
      expect(steady.entries).toBeLessThan(base.entries * 0.8);
      expect(steady.backFrames).toBe(0);
      expect(steady.speedCv).toBeLessThan(base.speedCv * 1.15);
      expect(steady.stallRatio).toBeLessThanOrEqual(base.stallRatio + 0.005);
      expect(steady.endErr).toBeLessThan(0.5);
      // 원격 아바타 지연은 늘지만 100ms 안쪽
      expect(steady.lagMs - base.lagMs).toBeLessThan(100);
    });
  }
});
