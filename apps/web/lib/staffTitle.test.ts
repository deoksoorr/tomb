import { isTitleId, sanitizeLook } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { headTitle, STAFF_TITLE, TITLES } from "./titles";

// 11/15 운영자 전용 칭호 「운영자」: 착용 목록 id가 아니라 서명된 운영자 표시로만 뜬다 → 일반 계정은 어떤 착용 목록으로도 못 띄운다

describe("운영자 전용 칭호", () => {
  it("운영자 표시면 낀 칭호 대신 운영자 칭호, 아니면 낀 칭호 그대로", () => {
    expect(headTitle("t_lv50", true)).toBe("staff");
    expect(headTitle(null, true)).toBe("staff");
    expect(headTitle("t_lv50", false)).toMatchObject({ id: "t_lv50" });
    expect(headTitle(null, false)).toBeNull();
  });

  it("일반 칭호 목록·착용 id에는 없다 (흉내 낼 id가 없다)", () => {
    expect(TITLES.some((t) => t.name === STAFF_TITLE.name)).toBe(false);
    for (const id of ["t_staff", "staff", "운영자", "t_admin"]) {
      expect(isTitleId(id)).toBe(false);
      expect(headTitle(id, false)).toBeNull();
    }
    // 실시간 서버·입장 토큰의 착용 목록 정리에서도 빠진다
    expect(sanitizeLook(["t_staff", "운영자", "t_lv50"])).toEqual(["t_lv50"]);
  });
});
