import { describe, expect, it } from "vitest";
import { ownedQuestBodies } from "./constants";

// 11/20 수집가 유령 외형: 교환소 기록이 없어도 해금 아이템을 가방에 가졌으면 소장 (선물로 받은 경우)
describe("ownedQuestBodies", () => {
  it("교환소 기록 또는 가방의 해금 아이템", () => {
    expect(ownedQuestBodies([], {})).toEqual([]);
    expect(ownedQuestBodies([], { q_body_collector: 1 })).toEqual(["collector"]);
    expect(ownedQuestBodies(["collector"], { q_body_collector: 1 })).toEqual(["collector"]);
    expect(ownedQuestBodies(["lantern"], undefined)).toEqual(["lantern"]);
    expect(ownedQuestBodies([], { q_body_collector: 0 })).toEqual([]);
  });
});
