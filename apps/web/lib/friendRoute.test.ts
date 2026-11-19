import { describe, expect, it } from "vitest";
import { MAP_IDS, type MapId } from "@tomb/protocol";
import { FRIEND_BIG_MSG, friendRoute, nextAfterVillage } from "./friendRoute";

// 11/19 [친구한테 가기] 맵 조합: 마을·캠핑장·바닷가 아홉 가지 모두 갈 수 있고, 몸이 커져 있으면 버스(다른 맵)만 막는다

describe("친구한테 가기 — 맵 조합 (lib/friendRoute)", () => {
  const cases: [MapId, MapId, ReturnType<typeof friendRoute>][] = [
    ["village", "village", { do: "warp" }],
    ["camp", "camp", { do: "warp" }],
    ["sea", "sea", { do: "warp" }],
    ["village", "camp", { do: "bus", to: "camp", via: null }],
    ["village", "sea", { do: "bus", to: "sea", via: null }],
    ["camp", "village", { do: "bus", to: "village", via: null }],
    ["sea", "village", { do: "bus", to: "village", via: null }],
    ["camp", "sea", { do: "bus", to: "sea", via: "village" }],
    ["sea", "camp", { do: "bus", to: "camp", via: "village" }],
  ];
  for (const [from, to, want] of cases) {
    it(`${from} → ${to}`, () => expect(friendRoute(from, to, 1)).toEqual(want));
  }

  it("아홉 조합 모두 막히지 않는다 (예전엔 캠핑장 ↔ 바닷가가 막혀 있었다)", () => {
    for (const from of MAP_IDS) for (const to of MAP_IDS) expect(friendRoute(from, to, 1).do).not.toBe("block");
  });

  it("캠핑장 ↔ 바닷가는 마을 정류장에 내린 뒤 그 맵 버스를 이어 탄다", () => {
    expect(nextAfterVillage(friendRoute("camp", "sea", 1))).toBe("sea");
    expect(nextAfterVillage(friendRoute("sea", "camp", 1))).toBe("camp");
    expect(nextAfterVillage(friendRoute("camp", "village", 1))).toBeUndefined();
    expect(nextAfterVillage(friendRoute("sea", "village", 1))).toBeUndefined();
    expect(nextAfterVillage(friendRoute("camp", "camp", 1))).toBeUndefined();
  });

  it("몸이 커져 있으면(배율 > 1) 다른 맵 친구한테는 못 간다 — 버스를 못 탄다", () => {
    for (const from of MAP_IDS)
      for (const to of MAP_IDS) {
        if (from === to) continue;
        expect(friendRoute(from, to, 1.5)).toEqual({ do: "block", message: FRIEND_BIG_MSG });
        expect(friendRoute(from, to, 3)).toEqual({ do: "block", message: FRIEND_BIG_MSG });
      }
  });

  it("커져 있어도 같은 맵 친구 옆으로는 순간이동 (버스를 타지 않는다)", () => {
    for (const m of MAP_IDS) expect(friendRoute(m, m, 3)).toEqual({ do: "warp" });
  });

  it("안내 문구는 버스 막힘(BIG_RIDE_TOAST)과 같은 말투", () => {
    expect(FRIEND_BIG_MSG).toMatch(/^몸이 너무 커서 버스를 탈 수 없어요\./);
  });
});
