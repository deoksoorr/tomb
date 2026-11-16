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
// 고친 기록: 11/16 묘역 하나로 합침(옛 묘역 8열 × 4줄, 오래된 묘비·촛불·안개를 가장자리로) + 다리 건너 묘역 → 범퍼카장(링크 테두리·입구 막대·매표소 충돌,
//   입구 상호작용, 구경 벤치 bV·bW를 마당 위쪽으로, 마당 바닥 돌 포장, 구역 이름 「범퍼카장」)
//   — 바뀐 소품·충돌·좌석·상호작용·바닥·걷기 격자·미니맵은 옛 묘역(x 48~432, y 288~544)과 범퍼카장 마당(x 592~864, y 784~1008) 안뿐이다.
//     둘레에 흩뿌린 나무는 한 그루도 바뀌지 않았다 (예전 철책·문·소품 자리를 흩뿌릴 때만 그대로 비운다 — layout.ts OLD_B_*)
// 고친 기록: 행운권 판매대(유령 잡화점 동쪽 풀밭, world/lotteryKiosk.ts) — 판매대 충돌 하나와 앞쪽 상호작용 하나만 더했다
//   — 바뀐 충돌·상호작용·걷기 격자는 판매대 둘레(x 668~700, y 147~181) 안뿐이다 (소품·좌석·미니맵은 그대로)
// 고친 기록: 11/16 남쪽 개편 — "범퍼카장·오리배 자리가 좁다". 오리 연못 248×144 → 264×196(오솔길 아래 ~ 아래 담 앞, 선착장·오리배 세 척 자리를 위로),
//   범퍼카 링크 192×148 → 284×180(마당 x 608~912, 입구 x 762, 타이어 둘 더함, 구경 벤치 bV·bW는 오솔길 북쪽 강둑으로), 벤치 bS를 연못 북동쪽 둑으로,
//   호박밭 허수아비·호박을 모닥불 아래로, 범퍼카장 귀퉁이 나무 둘 뺌(버드나무는 연못 남동쪽 둑), 호숫가 단풍·은행 하나씩, 강둑 흩뿌림 10 → 13그루,
//   흩뿌린 나무는 간판 앞·링크 귀퉁이 ↔ 강둑 틈(호박밭 가는 길)을 비운다(bumperLayout BUMPER_KEEPOUT), 오솔길 동쪽 끝을 입구까지
//   — 바뀐 것은 남쪽 띠(x 300~1120, y 740~1008)와 호숫가 나무 두 그루뿐이다. 흩뿌린 나무 자리가 바뀌어 지문·걷기 격자·미니맵 모두 새로 찍었다.
//   (MAP_VERSION을 올리면 첫 지문은 그 숫자 때문에 또 바뀐다 — 올린 뒤 다시 찍을 것)

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
    // 11/16 MAP_VERSION 12 → 13 (행운권 판매대·범퍼카장/오리 연못 넓힘)으로 다시 찍음 (예전 값 cf1f8667), 정류장 이름 「언젠가 버스 정류장」으로 다시 (3aa43fe6)
    expect(layoutPrint()).toBe("6da629a4");
  });
  it("걷기 격자", () => {
    const g = walkableGrid(8);
    expect(fnv(Array.from(g.cells as ArrayLike<number>).join(""))).toBe("bb5ee238");
  });
  it("미니맵 바탕", () => {
    expect(fnv(Array.from(minimapPixels()).join(","))).toBe("092dccbd");
  });
});
