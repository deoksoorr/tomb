import { describe, expect, it } from "vitest";
import { EARN_RULES } from "@/lib/economy";
import { goblinFacts } from "../odds/oddsData";
import { goblinCaughtLine, goblinCaughtTitle, goblinPointsText, goblinRangeText, goblinSpawnSub, goblinSpawnTitle } from "./goblinText";

describe("황금 고블린 알림 문구 (11/19)", () => {
  it("쉼표·범위", () => {
    expect(goblinPointsText(800)).toBe("800");
    expect(goblinPointsText(2000)).toBe("2,000");
    expect(goblinRangeText()).toBe("300~1,000P");
    expect(goblinSpawnSub("모닥불 광장")).toBe("모닥불 광장 쪽 · 가장 먼저 잡으면 최대 2,000P");
  });

  it("11/26 어느 맵에 나타났는지 (채널 모두) · 다른 맵이면 버스 안내", () => {
    expect(goblinSpawnTitle("sea")).toBe("황금 고블린이 바닷가에 나타났어요!");
    expect(goblinSpawnTitle("camp")).toBe("황금 고블린이 캠핑장에 나타났어요!");
    expect(goblinSpawnTitle()).toBe("황금 고블린이 마을에 나타났어요!");
    expect(goblinSpawnTitle("camp", true)).toBe("지금 캠핑장에 황금 고블린이 있어요!");
    expect(goblinSpawnSub("해변 모닥불", "sea", "sea")).toBe("해변 모닥불 쪽 · 가장 먼저 잡으면 최대 2,000P");
    expect(goblinSpawnSub("해변 모닥불", "sea", "village")).toBe("바닷가행 버스를 타요 · 최대 2,000P");
    expect(goblinSpawnSub("모닥불 광장", "village", "camp")).toBe("마을행 버스를 타요 · 최대 2,000P");
    expect(goblinSpawnSub("캠프파이어 광장", "camp", "sea")).toBe("마을에서 캠핑장행으로 갈아타요 · 최대 2,000P");
  });

  it("누가 잡았는지 (나·다른 사람·이름 없음·대박)", () => {
    expect(goblinCaughtTitle("진순", false)).toBe("진순님이 황금 고블린을 잡았어요!");
    expect(goblinCaughtTitle("진순", true)).toBe("내가 황금 고블린을 잡았어요!");
    expect(goblinCaughtTitle("  ", false)).toBe("누군가가 황금 고블린을 잡았어요!");
    expect(goblinCaughtLine("진순", false, 800)).toBe("진순님이 황금 고블린을 잡았어요! +800P");
    expect(goblinCaughtLine("진순", false, 2000)).toBe("대박! 진순님이 황금 고블린을 잡았어요! +2,000P");
  });

  it("확률 안내·벌기 규칙 문구가 새 보상과 맞다", () => {
    expect(goblinFacts()).toMatchObject({ points: "300~1,000P", normal: "97%", jackpot: "2,000P", jackpotChance: "3%", avg: "691P", life: "3분", maps: "마을 34%, 바닷가 33%, 캠핑장 33%" });
    expect(EARN_RULES.find((r) => r.source === "goblin")?.note).toContain("300~1,000P");
    expect(EARN_RULES.find((r) => r.source === "goblin")?.note).toContain("2,000P");
  });
});
