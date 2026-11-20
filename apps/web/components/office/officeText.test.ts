import { describe, expect, it } from "vitest";
import { OFFICE_FOOT, OFFICE_HELLO, OFFICE_LOADING, OFFICE_SHOP_SUB, OFFICE_SHOP_TITLE, officeBoughtText } from "./officeText";

// 11/20 총무팀 문대리 창 문구: 콜론 나열·가운뎃점 나열 없이, 받침에 맞는 조사

describe("총무팀 문대리 창 문구", () => {
  it("이름표 두 줄", () => {
    expect(OFFICE_SHOP_TITLE).toBe("총무팀 문대리");
    expect(OFFICE_SHOP_SUB).toBe("사무실 가구");
  });

  it("산 뒤 알림은 받침에 맞는 조사", () => {
    expect(officeBoughtText("파티션")).toContain("파티션을 가구 가방에");
    expect(officeBoughtText("정수기")).toContain("정수기를 가구 가방에");
    expect(officeBoughtText("퇴근 버튼")).toContain("퇴근 버튼을");
  });

  it("콜론 나열·가운뎃점 나열이 없다", () => {
    for (const t of [OFFICE_HELLO, OFFICE_FOOT, OFFICE_LOADING, officeBoughtText("안마의자")]) {
      expect(t, t).not.toMatch(/: /);
      expect(t, t).not.toMatch(/ · /);
    }
  });
});
