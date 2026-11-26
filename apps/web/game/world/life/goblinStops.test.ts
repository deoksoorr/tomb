import { describe, expect, it } from "vitest";
import { CAMP_BUS_BAY, SEA_BUS_BAY, VILLAGE_CAMP_BAY, VILLAGE_SEA_BAY, bayMid } from "../../bus/busBays";
import { goblinStopFor } from "./goblinStops";

// 11/26 다른 맵에 나타난 황금 고블린 → 정류장 쪽 화살표

describe("goblinStopFor", () => {
  it("same map → no stop (draw the goblin itself)", () => {
    for (const m of ["village", "camp", "sea"] as const) expect(goblinStopFor(m, m)).toBeNull();
  });

  it("village points to the bus for that map", () => {
    expect(goblinStopFor("village", "camp")).toEqual({ ...bayMid(VILLAGE_CAMP_BAY), to: "camp", label: "캠핑장행 버스" });
    expect(goblinStopFor("village", "sea")).toEqual({ ...bayMid(VILLAGE_SEA_BAY), to: "sea", label: "바닷가행 버스" });
  });

  it("camp and sea point to the village bus (sea ↔ camp changes buses in the village)", () => {
    expect(goblinStopFor("camp", "village")).toEqual({ ...bayMid(CAMP_BUS_BAY), to: "village", label: "마을행 버스" });
    expect(goblinStopFor("camp", "sea")).toEqual({ ...bayMid(CAMP_BUS_BAY), to: "village", label: "마을행 버스" });
    expect(goblinStopFor("sea", "village")).toEqual({ ...bayMid(SEA_BUS_BAY), to: "village", label: "마을행 버스" });
    expect(goblinStopFor("sea", "camp")).toEqual({ ...bayMid(SEA_BUS_BAY), to: "village", label: "마을행 버스" });
  });
});
