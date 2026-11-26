import { describe, expect, it } from "vitest";
import { CAMP_TRAMP_AREA, CAMP_TRAMP_GATE, CAMP_TRAMP_IN, CAMP_TRAMPOLINE, MAX_VALID_SPEED } from "@tomb/protocol";
import { campStandable } from "./campLayout";
import { nearTrampGate, SLIDE_OUT, SLIDE_RIDE_MS, slideRidePose, TRAMP_RUN } from "./campPlayPath";

// 11/26 놀이터 (트램펄린·워터 슬라이드) — 타는 길이 서버 속도 검증 안이고, 다 타면 설 수 있는 곳에 내려서는지

describe("워터 슬라이드·눈썰매 한 번 타기", () => {
  for (const snowy of [false, true]) {
    it(`${snowy ? "눈썰매" : "워터 슬라이드"}: 프레임마다 서버 속도 안, 끝나면 풀가(설 수 있는 곳)`, () => {
      let prev = slideRidePose(0, snowy);
      for (let t = 16; t < SLIDE_RIDE_MS; t += 16) {
        const p = slideRidePose(t, snowy);
        expect((Math.hypot(p.x - prev.x, p.y - prev.y) / 16) * 1000).toBeLessThan(MAX_VALID_SPEED);
        prev = p;
      }
      expect(campStandable(SLIDE_OUT.x, SLIDE_OUT.y)).toBe(true);
      expect(Math.hypot(prev.x - SLIDE_OUT.x, prev.y - SLIDE_OUT.y)).toBeLessThan(40);
      expect(slideRidePose(SLIDE_RIDE_MS - 50, snowy).inPool).toBe(!snowy);
    });
  }
});

describe("트램펄린 (입구로만 · 매트 안을 다닌다)", () => {
  it("사다리 밖(E 자리)은 설 수 있는 곳, 매트 안 첫 자리는 입구 앞이고 매트 안", () => {
    expect(campStandable(CAMP_TRAMP_GATE.x, CAMP_TRAMP_GATE.y + 2)).toBe(true);
    expect(nearTrampGate(CAMP_TRAMP_IN.x, CAMP_TRAMP_IN.y)).toBe(true);
    const A = CAMP_TRAMP_AREA;
    expect(((CAMP_TRAMP_IN.x - A.x) / A.rx) ** 2 + ((CAMP_TRAMP_IN.y - A.y) / A.ry) ** 2).toBeLessThanOrEqual(1);
  });
  it("매트 가운데·옆·뒤에서는 내리지 못한다 (입구 앞만)", () => {
    const T = CAMP_TRAMPOLINE;
    for (const [x, y] of [[T.x, T.y], [T.x - 30, T.y], [T.x + 30, T.y + 8], [T.x, T.y - 15]]) expect(nearTrampGate(x, y)).toBe(false);
  });
  it("매트 위 뛰기 속도는 서버 속도 검증 안", () => {
    expect(TRAMP_RUN).toBeLessThan(MAX_VALID_SPEED);
  });
});
