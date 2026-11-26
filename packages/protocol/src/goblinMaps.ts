import { CAMP_BUS_STOP, CAMP_FIRE, CAMP_PLAZA_R, CAMP_ROAD, type MapId } from "./camp";
import { SEA_BONFIRE, SEA_BOARDWALK } from "./sea";

// 11/26 황금 고블린이 나타나는 맵 (마을 34 · 바닷가 33 · 캠핑장 33 — 운영자: 거의 고르게)과 바닷가·캠핑장에서 뛰어다니는 길.
// 마을 길은 npc.ts GOBLIN_ROUTES 그대로 (옛 클라이언트도 같은 길을 계산한다 — 순서·개수를 바꾸지 않는다).
//
// 캠핑장 길 (11/26 폭포 계곡 개편 지도 기준): 캠프파이어 존 둘레 · 정류장 앞 · 통나무 다리 아래 큰길.
//   지금은 camp.ts 상수(모닥불 광장·정류장·버스 길)에서 읽어 자리가 옮겨 가도 따라간다. 시험: goblinMaps.test.ts (물·자리·범위)

export type GoblinRoute = { zone: string; pts: readonly (readonly [number, number])[] };

/** 등장 맵 확률 (합 1). 그 맵에 갈 수 있는 사람이 없으면(바닷가·캠핑장이 닫힌 서버) 그 몫은 마을로 */
export const GOBLIN_MAP_ODDS: readonly { map: MapId; p: number }[] = [
  { map: "village", p: 0.34 },
  { map: "sea", p: 0.33 },
  { map: "camp", p: 0.33 },
];

/** u = [0,1) 난수. allowed(map)이 false인 맵이 뽑히면 마을 */
export function pickGoblinMap(u: number, allowed: (m: MapId) => boolean = (m) => m === "village"): MapId {
  let acc = 0;
  for (const o of GOBLIN_MAP_ODDS) {
    acc += o.p;
    if (u < acc) return o.map === "village" || allowed(o.map) ? o.map : "village";
  }
  return "village";
}

// ── 바닷가 ── 산책 데크, 선베드 줄과 파라솔 줄 사이 길(y 436)·파라솔 아래 마른 모래(y 484), 서쪽 빈 모래밭, 해변 모닥불 둘레.
// 물이 가장 높이 들어와도(y 538) 젖지 않는 곳만. 시험: apps/web game/world/life/goblinMaps.test.ts (seaStandable·걷기 격자)
const BW_Y = SEA_BOARDWALK.y + Math.round(SEA_BOARDWALK.h / 2);
const SB = SEA_BONFIRE;
export const SEA_GOBLIN_ROUTES: readonly GoblinRoute[] = [
  { zone: "산책 데크", pts: [[240, BW_Y - 3], [480, BW_Y + 1], [720, BW_Y - 3], [960, BW_Y + 1], [1200, BW_Y - 3], [960, BW_Y + 5], [720, BW_Y + 4], [480, BW_Y + 5]] },
  { zone: "백사장 서쪽 끝", pts: [[80, 424], [170, 436], [260, 420], [330, 448], [260, 474], [160, 478], [70, 466]] },
  { zone: "백사장 서쪽", pts: [[372, 436], [540, 436], [700, 436], [740, 460], [700, 484], [540, 484], [370, 486], [350, 460]] },
  { zone: "백사장 동쪽", pts: [[1000, 436], [1150, 436], [1300, 436], [1330, 460], [1300, 484], [1150, 484], [1000, 486], [980, 460]] },
  { zone: "해변 모닥불", pts: [[SB.x, SB.y - 50], [SB.x + 46, SB.y - 34], [SB.x + 56, SB.y], [SB.x + 42, SB.y + 40], [SB.x, SB.y + 50], [SB.x - 42, SB.y + 40], [SB.x - 56, SB.y], [SB.x - 46, SB.y - 34]] },
];

// ── 캠핑장 (임시 — 위 ★) ──
/** 캠핑장 길: 모닥불 광장 둘레(통나무 의자 사이로 도는 고리 — 6차 배치에서 시험으로 찾은 크기)와 정류장 앞 버스 길 */
export function campGoblinRoutes(): readonly GoblinRoute[] {
  const f = CAMP_FIRE;
  const rx = CAMP_PLAZA_R + 4;
  const ry = Math.round(rx * 0.75);
  const ring = Array.from({ length: 8 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    return [Math.round(f.x + Math.cos(a) * rx), Math.round(f.y + 6 + Math.sin(a) * ry)] as const;
  });
  const s = CAMP_BUS_STOP;
  const roadY = CAMP_ROAD.y + Math.round(CAMP_ROAD.h / 2);
  const walkY = s.y + 18;
  const stop: (readonly [number, number])[] = [
    [s.x - 90, roadY],
    [s.x, roadY + 4],
    [s.x + 100, roadY],
    [s.x + 130, walkY + 6],
    [s.x + 80, walkY],
    [s.x - 60, walkY],
  ];
  return [
    { zone: "캠프파이어 광장", pts: ring },
    { zone: "정류장 앞", pts: stop },
    // 11/26 폭포 계곡 개편: 통나무 다리 건너 아래쪽 큰길 (관리소 앞 → 캠프파이어 존 가는 흙길, 폭 2칸)
    {
      zone: "통나무 다리 길",
      pts: [
        [700, 718],
        [780, 724],
        [860, 718],
        [900, 716],
        [820, 728],
        [740, 724],
      ],
    },
  ];
}
export const CAMP_GOBLIN_ROUTES: readonly GoblinRoute[] = campGoblinRoutes();
