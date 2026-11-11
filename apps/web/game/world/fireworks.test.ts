import { CAMPFIRES, CAMPFIRE_LOG_DY } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { cineCenter, cineZoom, LETTERBOX } from "./campfireMath";
import { FIT_MIN_RADIUS, FIT_MIN_RISE, fitBurst, FW_BASE_RADIUS, fireworkPlan } from "./fxMath";

// 8번: 불멍(모닥불 구도, 4~5배 줌 + 레터박스) 중 폭죽이 화면 위로 잘리던 문제

/** 불멍 화면에서 레터박스를 뺀 보이는 영역 (월드 좌표) */
function cineSafe(camW: number, camH: number) {
  const fire = CAMPFIRES[0];
  const z = cineZoom(camW, camH);
  const c = cineCenter(fire);
  const w = camW / z;
  const h = camH / z;
  const inset = h * LETTERBOX;
  return { fire, view: { x: c.x - w / 2, y: c.y - h / 2 + inset, width: w, height: h - 2 * inset } };
}

describe("폭죽을 보이는 영역 안에 맞추기", () => {
  for (const [camW, camH] of [
    [1440, 900],
    [390, 844],
    [1024, 640],
  ] as const) {
    it(`불멍 ${camW}×${camH}: 모닥불 둘레 어느 자리에서 쏴도 터지는 곳이 레터박스 안`, () => {
      const { fire, view } = cineSafe(camW, camH);
      const seats = [
        { x: fire.x - 9, y: fire.y - CAMPFIRE_LOG_DY },
        { x: fire.x + 9, y: fire.y + CAMPFIRE_LOG_DY + 6 },
        { x: fire.x - 26, y: fire.y + 3 },
        { x: fire.x + 26, y: fire.y + 3 },
      ];
      for (const s of seats) {
        for (const power of [1, 2, 3, 4]) {
          const plan = fireworkPlan(power);
          const r0 = power >= 4 ? Math.max(FW_BASE_RADIUS * plan.radius, 0.42 * Math.min(view.width, view.height)) : FW_BASE_RADIUS * plan.radius;
          const { h, r } = fitBurst(s.x, s.y, 96, r0, view);
          const by = s.y - h;
          expect(h).toBeGreaterThanOrEqual(FIT_MIN_RISE);
          expect(r).toBeGreaterThanOrEqual(FIT_MIN_RADIUS);
          // 터지는 중심과 불티(반경의 85%)가 보이는 영역 위쪽 안
          expect(by - r * 0.85).toBeGreaterThanOrEqual(view.y - 1e-6);
          expect(by).toBeLessThan(view.y + view.height);
        }
      }
    });
  }

  it("평소 화면(3배 줌)에서 가운데서 쏘면 그대로", () => {
    const view = { x: 0, y: 0, width: 480, height: 300 };
    expect(fitBurst(240, 200, 96, 36, view)).toEqual({ h: 96, r: 36 });
  });

  it("맵 위쪽 담 근처(화면 위 끝)에서 쏘면 덜 솟아 화면 안에서 터진다", () => {
    const view = { x: 0, y: 0, width: 480, height: 300 };
    const { h, r } = fitBurst(240, 70, 96, 36, view);
    expect(70 - h - r * 0.85).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(96);
  });
});
