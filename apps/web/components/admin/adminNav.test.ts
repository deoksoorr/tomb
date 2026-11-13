import { describe, expect, it } from "vitest";
import { NAV, navGroupOf, navItem, panelFromHash } from "./adminNav";

describe("관리자 메뉴", () => {
  it("해시로 화면을 고른다", () => {
    expect(panelFromHash("#members")).toBe("members");
    expect(panelFromHash("reports")).toBe("reports");
  });

  it("비었거나 모르는 해시는 대시보드", () => {
    expect(panelFromHash("")).toBe("dashboard");
    expect(panelFromHash("#")).toBe("dashboard");
    expect(panelFromHash("#nope")).toBe("dashboard");
  });

  it("예전 탭 이름(content)은 묘역 묘비로", () => {
    expect(panelFromHash("#content")).toBe("graves");
  });

  it("메뉴 id는 겹치지 않고, 항목마다 묶음을 찾는다", () => {
    const ids = NAV.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(navItem(id).id).toBe(id);
      expect(navGroupOf(id).items.some((i) => i.id === id)).toBe(true);
    }
  });
});
