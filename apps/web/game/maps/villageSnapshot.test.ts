import { describe, expect, it } from "vitest";
import { BOATS, CAMPFIRES, FISHING_SPOTS, FURNITURE, GRAVE_AREAS, HOUSE_LOTS, MAP_HEIGHT, MAP_VERSION, MAP_WIDTH, PONDS, SEATS, SPAWN, ZONES } from "@tomb/protocol";
import { allProps, interactables, staticColliders, walkableGrid } from "../world/layout";
import { minimapPixels } from "../world/minimapArt";
import { BUS_STOP, FISH_DECOR } from "../world/fishZone";

// 11/15 두 번째 맵(캠핑장)을 더하면서 마을 데이터가 한 칸도 바뀌지 않았는지 지문으로 확인한다.
// 마을을 일부러 고친 패치라면 아래 값을 새로 찍어 바꾼다 (MAP_VERSION도 함께 올릴 일인지 먼저 본다).
// 고친 기록: 11/15 주말 버스 정류장 다듬기(승강장·정차 칸·E 범위·시간표 자리) + 납품 부두 좁히기(아래 마당·잔교·낚시 자리 7 → 6, 나루터와 띄움)
//   — 바뀐 충돌·소품·상호작용·걷기 격자는 모두 납품 부두·정류장 구역(x 1136~1408, y 632~920) 안이다
// 고친 기록: 11/15 납품 부두 없앰(아래 마당·아치·잔교·끝 데크·잔교 낚시 자리 4곳, 구역 이름 → 「버스 정류장 마당」) + 둑·강둑 낚시 자리 3곳 더함
//   + 어부 영감 노점을 호수 낚시 잔교 서쪽 끝으로(노점 옆 물통·상자) + 정류장 버스 방향(동쪽에서 들어와 서쪽으로)·정차 칸 자리
//   — 바뀐 충돌·난간·걷기 격자는 예전 부두 구역(x 1136~1408, y 632~920)과 새 노점 자리(x 1000~1150, y 890~960) 안뿐이다 (낚시 자리는 강둑 둘을 더했다) (소품·가구·상호작용은 그대로)

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const layoutPrint = () =>
  fnv(
    JSON.stringify({
      MAP_VERSION,
      MAP_WIDTH,
      MAP_HEIGHT,
      SPAWN,
      ZONES,
      FURNITURE,
      SEATS,
      CAMPFIRES,
      GRAVE_AREAS,
      HOUSE_LOTS,
      PONDS,
      BOATS,
      FISHING_SPOTS,
      BUS_STOP,
      FISH_DECOR,
      interactables: interactables(),
      colliders: staticColliders(),
      props: allProps(),
    }),
  );

describe("마을 지문 (캠핑장이 생겨도 그대로)", () => {
  it("배치·좌석·상호작용·충돌·소품", () => {
    expect(layoutPrint()).toBe("de7547d5");
  });
  it("걷기 격자", () => {
    const g = walkableGrid(8);
    expect(fnv(Array.from(g.cells as ArrayLike<number>).join(""))).toBe("af258020");
  });
  it("미니맵 바탕", () => {
    expect(fnv(Array.from(minimapPixels()).join(","))).toBe("4d06ecea");
  });
});
