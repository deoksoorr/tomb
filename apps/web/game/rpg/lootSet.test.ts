import { describe, expect, it } from "vitest";
import { huntBossDrop } from "@/lib/rpg/rewards";
import { lootLook } from "./lootLook";

// 11/15 세트 장비·재료·상자 꾸미기의 바닥 드롭 모양 · 슈퍼 계정 시험 드롭(사냥터 우두머리)

describe("세트 장비 바닥 드롭", () => {
  it("과장급 = 희귀 빔, 임원급 = 전설 하늘 빔 · 재료는 묶음 하나 · 꾸미기는 이름과 일수", () => {
    expect(lootLook({ kind: "set", id: "s003.a7c5d18" })).toMatchObject({
      tier: 3,
      sky: "gold",
      name: "임원급 막차 놓친 도끼",
      notice: "임원급 세트 장비!",
    });
    expect(lootLook({ kind: "set", id: "s012.h9r5p25" })).toMatchObject({
      tier: 2,
      notice: "과장급 세트 장비!",
    });
    expect(lootLook({ kind: "set", id: "s000.a4c2" })!.tier).toBe(1);
    expect(lootLook({ kind: "mat", id: "m_doc", qty: 7 })).toMatchObject({
      tier: 0,
      name: "결재 서류 ×7",
    });
    expect(lootLook({ kind: "cosmetic", id: "hat_cat", days: 7 })!.name).toBe("고양이 귀 · 7일");
    expect(lootLook({ kind: "set", id: "s003.z9" })).toBeNull();
  });

  it("슈퍼 계정 시험 드롭(sup): 사냥터 우두머리를 잡으면 장비가 늘 하나, 끄면 보통 굴림 그대로", () => {
    let normal = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = { game: "hunt" as const, difficulty: "hell" as const, seed };
      expect(huntBossDrop({ ...t, sup: true })?.kind).toBe("gear");
      if (huntBossDrop(t)) normal++;
      expect(huntBossDrop({ ...t, sup: false })).toEqual(huntBossDrop(t));
    }
    expect(normal).toBeLessThan(200);
  });
});
