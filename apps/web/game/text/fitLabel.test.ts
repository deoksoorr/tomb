import { describe, expect, it } from "vitest";
import { clampChars, fitFirst, fitParts } from "./fitLabel";

// 시험용 폭: 한글·기호 12px, 숫자·영문·공백 6px (Galmuri11 12px과 비슷한 비율)
const measure = (s: string) => [...s].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 6 : 12), 0);

describe("문패 글씨 폭 맞추기", () => {
  it("들어가면 그대로", () => {
    expect(fitParts("3번지 · ", "달빛 서재", "", 200, measure)).toBe("3번지 · 달빛 서재");
  });

  it("넘치면 가운데(집 이름)만 줄이고 번지·(내 집)은 남긴다", () => {
    const s = fitParts("3번지 · ", "달빛이머무는아주오래된작은서재같은집", " (내 집)", 186, measure)!;
    expect(measure(s)).toBeLessThanOrEqual(186);
    expect(s.startsWith("3번지 · 달빛")).toBe(true);
    expect(s.endsWith("… (내 집)")).toBe(true);
  });

  it("최소 글자 수보다 줄여야 하면 null", () => {
    expect(fitParts("", "아주아주긴닉네임입니다", " · 전설의 명당 · 1200점", 186, measure, 6)).toBeNull();
  });

  it("후보 순서대로: 호칭을 빼서라도 주인 이름을 남긴다", () => {
    const owner = "아주아주긴닉네임입니다요";
    const s = fitFirst(
      [
        { body: owner, tail: " · 전설의 명당 · 1200점", minBody: 6 },
        { body: owner, tail: " · 1200점" },
      ],
      186,
      measure,
    );
    expect(measure(s)).toBeLessThanOrEqual(186);
    expect(s).toMatch(/^아주아주긴닉.*… · 1200점$|^아주아주긴닉네임입니다요 · 1200점$/);
    expect(s).not.toContain("전설의 명당");
  });

  it("넉넉하면 첫 후보 그대로", () => {
    expect(fitFirst([{ body: "가람", tail: " · 쓸쓸한 터 · 0점" }], 400, measure)).toBe("가람 · 쓸쓸한 터 · 0점");
  });

  it("글자 수로 자르기 (이모지 쌍은 쪼개지 않는다)", () => {
    expect(clampChars("달빛 서재", 12)).toBe("달빛 서재");
    expect(clampChars("달빛이머무는아주오래된작은서재같은집", 10)).toBe("달빛이머무는아주오…");
    expect(clampChars("🌙🌙🌙🌙", 3)).toBe("🌙🌙…");
  });
});
