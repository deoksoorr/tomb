import { describe, expect, it } from "vitest";
import {
  BORI_NO_HOUSE_LINES,
  CLERK_NO_HOUSE_LINES,
  HOUSING_NO_PATH_TOAST,
  housingWalkHint,
  NO_HOUSE_BROWSE,
  NO_HOUSE_BROWSING,
  NO_HOUSE_GUIDE,
  NO_HOUSE_OK,
  NO_HOUSE_WALK,
  noHouseShakeLabel,
  noHouseTitle,
  pickNoHouseLine,
  STALL_NO_HOUSE_LINES,
} from "./noHouseText";

// 11/20 집 없는 손님 거절 대사: 콜론 나열·가운뎃점 나열 없이, 짧게, 대표 대사는 처음에

const all = () => [
  ...STALL_NO_HOUSE_LINES,
  ...BORI_NO_HOUSE_LINES,
  ...CLERK_NO_HOUSE_LINES,
  NO_HOUSE_GUIDE,
  NO_HOUSE_WALK,
  NO_HOUSE_BROWSE,
  NO_HOUSE_OK,
  NO_HOUSE_BROWSING,
  noHouseTitle("stall"),
  noHouseTitle("bori"),
  noHouseShakeLabel("stall"),
  noHouseShakeLabel("bori"),
  noHouseTitle("clerk"),
  noHouseShakeLabel("clerk"),
  housingWalkHint(false),
  housingWalkHint(true),
  HOUSING_NO_PATH_TOAST,
];

describe("집 없는 손님 거절 대사", () => {
  it("처음 말을 걸면 대표 대사", () => {
    expect(pickNoHouseLine("stall", null, 0.7)).toBe("어딜 무주택자가! 떼잇!");
    expect(pickNoHouseLine("bori", null, 0.2)).toBe("멍! 집 없는 분한테 방석은 못 드려요. 집부터 장만해요!");
    expect(pickNoHouseLine("clerk", null, 0.5)).toBe("사원증도 없는 분… 아니, 집도 없는 분은 비품 지급이 안 돼요!");
  });

  it("다음부터는 방금 한 말과 다른 줄 (무작위 끝값도 목록 안)", () => {
    for (const who of ["stall", "bori", "clerk"] as const) {
      const lines: readonly string[] = who === "stall" ? STALL_NO_HOUSE_LINES : who === "clerk" ? CLERK_NO_HOUSE_LINES : BORI_NO_HOUSE_LINES;
      for (const prev of lines) {
        for (const r of [0, 0.3, 0.5, 0.99, 0.9999999, 1, -1]) {
          const got = pickNoHouseLine(who, prev, r);
          expect(lines).toContain(got);
          expect(got).not.toBe(prev);
        }
      }
    }
  });

  it("무작위로 고르면 여러 줄이 고루 나온다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickNoHouseLine("stall", STALL_NO_HOUSE_LINES[0], i / 40));
    expect(seen.size).toBe(STALL_NO_HOUSE_LINES.length - 1);
  });

  it("콜론 나열·가운뎃점 나열이 없고, 대사는 말풍선 한 칸에 들어갈 만큼 짧다", () => {
    for (const t of all()) {
      expect(t, t).not.toMatch(/: /);
      expect(t, t).not.toMatch(/ · /);
    }
    for (const t of [...STALL_NO_HOUSE_LINES, ...BORI_NO_HOUSE_LINES, ...CLERK_NO_HOUSE_LINES]) {
      expect(t.length, t).toBeLessThanOrEqual(40);
      expect(t, t).toMatch(/[!?.]$/);
    }
  });

  it("걷기 안내는 사냥터·잡화점 걷기와 같은 꼴", () => {
    expect(housingWalkHint(false)).toBe("분양 사무소로 가는 중… (방향키로 멈춰요)");
    expect(housingWalkHint(true)).toContain("조이스틱");
  });
});
