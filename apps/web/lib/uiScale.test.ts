import { describe, expect, it } from "vitest";
import { uiScaleFor } from "./uiScale";

// 11/22 큰 데스크톱 화면 HUD 배율
describe("uiScaleFor", () => {
  it("1920×1080 이하 데스크톱·터치 화면은 1", () => {
    expect(uiScaleFor(1280, 800, false)).toBe(1);
    expect(uiScaleFor(1024, 600, false)).toBe(1);
    expect(uiScaleFor(1600, 900, false)).toBe(1);
    expect(uiScaleFor(1920, 1080, false)).toBe(1);
    expect(uiScaleFor(1920, 950, false)).toBe(1);
    expect(uiScaleFor(2560, 1440, true)).toBe(1);
  });

  it("폭·높이 중 작은 쪽 비율로 0.05 단위, 최대 1.5", () => {
    expect(uiScaleFor(2560, 1440, false)).toBe(1.3);
    expect(uiScaleFor(2560, 1310, false)).toBe(1.2);
    expect(uiScaleFor(3840, 2160, false)).toBe(1.5);
    // 아주 넓고 낮은 창은 높이 기준
    expect(uiScaleFor(3440, 1200, false)).toBe(1.1);
  });

  it("크기를 모르면 1", () => {
    expect(uiScaleFor(0, 0, false)).toBe(1);
    expect(uiScaleFor(Number.NaN, 900, false)).toBe(1);
  });
});
