import { describe, expect, it } from "vitest";
import { bareTone, conceptSuffix, evergreenTone, guessTone } from "./winterScenery";

// 11/17 시점이 바뀌는 장면의 겨울판 색 짐작 (winterScenery.guessTone)
const lum = (c: number) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

describe("winterScenery", () => {
  it("판마다 텍스처 키 꼬리가 달라요 (기본판은 예전 키 그대로)", () => {
    expect(conceptSuffix("default")).toBe("");
    expect(conceptSuffix("winter")).not.toBe(conceptSuffix("christmas"));
  });

  it("물·하늘빛·무채색(돌·벽·길)은 그대로 둬요", () => {
    for (const c of [0x5481a0, 0x4a7898, 0x9cc2d6, 0x908e83, 0x6a6a6e, 0xd6c6a6]) expect(guessTone(c, 3, 4)).toBe(-1);
  });

  it("풀빛은 눈밭으로 (밝게), 아주 짙은 초록은 상록수로", () => {
    for (const c of [0x75804f, 0x626d45, 0x6e7c58]) {
      const t = guessTone(c, 10, 20);
      expect(t).not.toBe(-1);
      expect(lum(t as number)).toBeGreaterThan(170);
    }
    const dark = guessTone(0x24402e, 1, 1);
    expect(dark).toBe(evergreenTone(lum(0x24402e)));
  });

  it("단풍·은행은 잎 진 가지빛으로 (빨강·노랑이 남지 않아요)", () => {
    for (const c of [0xc8482a, 0xe06a34, 0xe8b83a]) {
      const t = guessTone(c, 5, 7) as number;
      expect(t).not.toBe(-1);
      const r = (t >> 16) & 255;
      const g = (t >> 8) & 255;
      expect(r - g).toBeLessThan(24);
    }
    expect(bareTone(100, 2, 3)).toBe(bareTone(100, 2, 3));
  });
});
