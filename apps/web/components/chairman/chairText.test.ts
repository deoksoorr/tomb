import { describe, expect, it } from "vitest";
import { boardTags, dmgText, goState, HALL_EMPTY, hallWeekText, lastedText, ledLine, msClock, pips, pointsLine, runsText, sealBrief, sealRule, sealTag, weekText } from "./chairText";

describe("chairText", () => {
  it("버틴 시간: 열은 m:ss, 11/22 칸 글은 「버틴 시간 m:ss」, 옛 기록은 - · 피해는 「피해 N」", () => {
    expect(msClock(872_400)).toBe("14:32");
    expect(msClock(65_000)).toBe("1:05");
    expect(msClock(undefined)).toBe("-");
    expect(msClock(0)).toBe("-");
    expect(lastedText(872_400)).toBe("버틴 시간 14:32");
    expect(lastedText(70_000)).toBe("버틴 시간 1:10");
    expect(lastedText(null)).toBeNull();
    expect(dmgText(1_234_567)).toBe("피해 1,234,567");
  });

  it("11/22 명예의 전당: 주는 다음 월요일 정산 날로", () => {
    expect(hallWeekText("20261123")).toBe("11월 30일 정산");
    expect(hallWeekText("20261228")).toBe("1월 4일 정산");
    expect(HALL_EMPTY).toBe("첫 명예의 전당은 11월 30일 월요일 새벽 5시 정산 뒤에 채워져요.");
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

  it("11/22 전광판은 노멀·헬 현재 1위를 차례로 (LED 글꼴로 그릴 수 있는 글자만)", () => {
    const both = { normal: { name: "겨울토끼", damage: 48_213_904 }, hell: { name: "불꽃여우", damage: 1_234_567 } };
    const normalOnly = { normal: both.normal, hell: null };
    for (const t of [ledLine(null), ledLine(both), ledLine(normalOnly), ledLine({ normal: null, hell: null })]) expect(t).toMatch(/^[A-Z0-9 :#,.*-]+$/);
    expect(ledLine(both)).toBe("PANGYO LIGHTHOUSE * NORMAL NOW #1 48,213,904 * HELL NOW #1 1,234,567 * ");
    expect(ledLine(normalOnly)).toBe("PANGYO LIGHTHOUSE * NORMAL NOW #1 48,213,904 * HELL #1 WAITING * ");
    expect(ledLine({ normal: null, hell: null })).toBe("PANGYO LIGHTHOUSE * CEO 1:1 MEETING * ");
  });

  it("11/22 등대 이름표: 노멀 → 헬 두 줄 (없는 모드는 기다린다는 줄, 둘 다 없으면 없음)", () => {
    expect(boardTags(null)).toEqual([]);
    expect(boardTags({ normal: null, hell: null })).toEqual([]);
    expect(boardTags({ normal: { name: "겨울토끼", damage: 1_234_567 }, hell: null })).toEqual([
      { mode: "normal", text: "노멀 현재 1위 겨울토끼 1,234,567" },
      { mode: "hell", text: "헬 1위를 기다리고 있어요" },
    ]);
    expect(boardTags({ normal: null, hell: { name: "가나다라마바사아자차카", damage: 9 } })).toEqual([
      { mode: "normal", text: "노멀 1위를 기다리고 있어요" },
      { mode: "hell", text: "헬 현재 1위 가나다라마바사아자차… 9" },
    ]);
  });
});
