import { describe, expect, it } from "vitest";
import { EARN_RULES } from "@/lib/economy";
import { goblinFacts } from "../odds/oddsData";
import { goblinCaughtLine, goblinCaughtTitle, goblinPointsText, goblinRangeText, goblinSpawnSub } from "./goblinText";

describe("황금 고블린 알림 문구 (11/19)", () => {
  it("쉼표·범위", () => {
    expect(goblinPointsText(800)).toBe("800");
    expect(goblinPointsText(2000)).toBe("2,000");
    expect(goblinRangeText()).toBe("300~1,000P");
    expect(goblinSpawnSub("모닥불 광장")).toBe("모닥불 광장 쪽 · 가장 먼저 잡으면 최대 2,000P");
  });

  it("누가 잡았는지 (나·다른 사람·이름 없음·대박)", () => {
    expect(goblinCaughtTitle("진순", false)).toBe("진순님이 황금 고블린을 잡았어요!");
    expect(goblinCaughtTitle("진순", true)).toBe("내가 황금 고블린을 잡았어요!");
    expect(goblinCaughtTitle("  ", false)).toBe("누군가가 황금 고블린을 잡았어요!");
    expect(goblinCaughtLine("진순", false, 800)).toBe("진순님이 황금 고블린을 잡았어요! +800P");
    expect(goblinCaughtLine("진순", false, 2000)).toBe("대박! 진순님이 황금 고블린을 잡았어요! +2,000P");
  });

  it("확률 안내·벌기 규칙 문구가 새 보상과 맞다", () => {
    expect(goblinFacts()).toMatchObject({ points: "300~1,000P", normal: "92%", jackpot: "2,000P", jackpotChance: "8%", avg: "758P" });
    expect(EARN_RULES.find((r) => r.source === "goblin")?.note).toContain("300~1,000P");
    expect(EARN_RULES.find((r) => r.source === "goblin")?.note).toContain("2,000P");
  });
});
