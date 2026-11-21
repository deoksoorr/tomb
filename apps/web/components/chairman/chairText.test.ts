import { describe, expect, it } from "vitest";
import { boardName, goState, lastedText, ledLine, msClock, pips, pointsLine, runsText, sealBrief, sealRule, sealTag, weekText } from "./chairText";

describe("chairText", () => {
  it("버틴 시간: 열은 m:ss, 입장 창은 「분 초 버팀」, 옛 기록은 -", () => {
    expect(msClock(872_400)).toBe("14:32");
    expect(msClock(65_000)).toBe("1:05");
    expect(msClock(undefined)).toBe("-");
    expect(msClock(0)).toBe("-");
    expect(lastedText(872_400)).toBe("14분 32초 버팀");
    expect(lastedText(42_000)).toBe("42초 버팀");
    expect(lastedText(null)).toBeNull();
  });

  it("11/21 판 포인트 줄: 노멀 40P·크런치 80P, 헬 70P·크런치 140P", () => {
    expect(pointsLine("normal")).toBe("1분에 40P, 크런치 땐 80P");
    expect(pointsLine("hell")).toBe("1분에 70P, 크런치 땐 140P");
  });

  it("출근 단추: 자격·연습·판 다 씀", () => {
    expect(goState("normal", { eligible: true, remaining: 2, practice: false, busy: false })).toEqual({ label: "노멀로 사직서 내기", disabled: false });
    expect(goState("hell", { eligible: true, remaining: 0, practice: false, busy: false })).toEqual({ label: "오늘 판 다 씀", disabled: true });
    expect(goState("hell", { eligible: true, remaining: 0, practice: true, busy: false })).toEqual({ label: "헬 연습하기", disabled: false });
    expect(goState("normal", { eligible: false, remaining: 2, practice: false, busy: false }).disabled).toBe(true);
    expect(goState("normal", { eligible: true, remaining: 2, practice: false, busy: true }).disabled).toBe(true);
  });

  it("남은 판·순위·봉인", () => {
    expect(pips(1)).toEqual([true, false]);
    expect(runsText(2)).toBe("2 / 2");
    expect(weekText(null)).toBe("기록 없음");
    expect(weekText({ rank: 1 })).toBe("1위 ★");
    expect(weekText({ rank: 7 })).toBe("7위");
    expect(sealTag(45_000)).toBe("45초마다 자동 반려");
    expect(sealRule(45_000)).toBe("45초마다 회장님이 스킬을 하나씩 반려해요. 주로 패시브부터, 레벨이 높은 것부터예요. 무엇이 반려될지는 3초 전에 알려 드려요.");
    expect(sealBrief(45_000)).toBe("45초마다 스킬이 하나씩 반려돼요");
  });

  it("전광판은 LED 글꼴로 그릴 수 있는 글자만", () => {
    for (const t of [ledLine(null), ledLine({ damage: 48_213_904 })]) expect(t).toMatch(/^[A-Z0-9 :#,.*-]+$/);
    expect(ledLine({ damage: 48_213_904 })).toContain("#1 48,213,904");
    expect(boardName(null)).toBeNull();
    expect(boardName("가나다라마바사아자차카")).toBe("이번 주 1위 가나다라마바사아자차…");
  });
});
