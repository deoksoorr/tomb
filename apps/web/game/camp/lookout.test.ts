import { describe, expect, it } from "vitest";
import { CAMP_DECKS } from "@tomb/protocol";
import { CAMP_INTERACTABLES, campStandable } from "./campLayout";
import { aimedDeck, clampAim, flicker, SCOPE_HOME, SCOPE_RANGE, scopeCaption, stepAim, swayAt, tentViews } from "./lookoutMath";

describe("전망대 망원경 (lookoutMath)", () => {
  it("겨눈 곳은 광장 둘레 타원 안으로, 데크 고리 전체를 훑을 수 있다", () => {
    const far = clampAim({ x: SCOPE_HOME.x + 2000, y: SCOPE_HOME.y });
    expect(far.x).toBeCloseTo(SCOPE_HOME.x + SCOPE_RANGE.rx);
    for (const d of CAMP_DECKS) expect(clampAim(d)).toEqual({ x: d.x, y: d.y });
    let a: { x: number; y: number } = { x: SCOPE_HOME.x, y: SCOPE_HOME.y };
    for (let i = 0; i < 200; i++) a = stepAim(a, 1, 0, 16);
    expect(a.x).toBeCloseTo(SCOPE_HOME.x + SCOPE_RANGE.rx);
  });
  it("흔들림은 작고, 움직임 줄이기면 0", () => {
    for (let t = 0; t < 10_000; t += 333) {
      const s = swayAt(t, false);
      expect(Math.abs(s.x)).toBeLessThan(3);
      expect(Math.abs(s.y)).toBeLessThan(3);
    }
    expect(swayAt(1234, true)).toEqual({ x: 0, y: 0 });
  });
  it("텐트 목록: 없는 데크는 버리고 사람은 0~3, 지금은 빈 배열 → 빈 데크 안내", () => {
    const v = tentViews([{ deck: 3, lit: true, people: 9 }, { deck: 99 }, { deck: 3, people: 1 }, { deck: 1.5 }]);
    expect(v).toEqual([{ deck: 3, x: CAMP_DECKS[2].x, y: CAMP_DECKS[2].y, style: null, lit: false, people: 1 }]);
    expect(tentViews([])).toEqual([]);
    expect(scopeCaption(5, [])).toBe("5번 데크는 비어 있어요.");
    expect(scopeCaption(3, tentViews([{ deck: 3, lit: true }]))).toBe("3번 데크 텐트에 불이 켜져 있어요.");
    expect(scopeCaption(null, [])).toMatch(/방향키/);
    // 터치 기기는 조이스틱·[상호작용] 버튼으로 안내한다
    expect(scopeCaption(null, [], true)).toBe("조이스틱으로 둘러봐요. [상호작용] 버튼을 누르면 내려놓아요.");
  });
  it("가운데에 가까운 데크를 고르고, 불빛 깜빡임은 0.55~1", () => {
    expect(aimedDeck(CAMP_DECKS[6])).toBe(7);
    expect(aimedDeck(SCOPE_HOME)).toBeNull();
    for (let t = 0; t < 5000; t += 37) {
      const f = flicker(t, 4.2);
      expect(f).toBeGreaterThanOrEqual(0.55);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it("전망대 망원경 자리는 하나, 그 앞에 설 수 있다", () => {
    const l = CAMP_INTERACTABLES.filter((o) => o.kind === "lookout");
    expect(l).toHaveLength(1);
    expect(campStandable(l[0].x, l[0].y)).toBe(true);
  });
});
