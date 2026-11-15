import { describe, expect, it } from "vitest";
import { stageGlow } from "./outfitStage";

// 한국 시간 시각 → UTC ms (KST = UTC+9)
const kst = (h: number) => Date.UTC(2026, 10, 15, h - 9, 0, 0);

describe("stageGlow (야광 미리보기)", () => {
  it("상점·염색 미리보기(liveGlow 없음)는 낮에도 늘 빛난다", () => {
    expect(stageGlow({}, kst(12))).toBe(true);
    expect(stageGlow({ liveGlow: false }, kst(12))).toBe(true);
  });

  it("가방 [지금 모습](liveGlow)은 마을의 내 캐릭터처럼 낮에는 꺼지고 밤에는 켜진다", () => {
    expect(stageGlow({ liveGlow: true }, kst(12))).toBe(false);
    expect(stageGlow({ liveGlow: true }, kst(23))).toBe(true);
  });
});
