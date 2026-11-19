import type { GatherNode, NodeKind, Where } from "./catalog";

// 11/16 사용자 "곤충 채집·채집이 너무 적어요" → 달물결 포구에도 갯벌 구멍(SEA_GATHER_NODES) 말고 뭍 채집 지점을 더해요.
// 새 종은 없어요 — 마을·캠핑장처럼 기존 종의 출현 장소(where)만 빌려요:
//  - 별장 풀밭·정원 = 풀밭(meadow), 동쪽 소나무 풀밭 = 숲(forest), 모래 언덕(갯그령) 곤충 = 풀밭(meadow)
//  - 백사장 모래 파 보기 = 호숫가(lakeside) 발굴품 (병뚜껑·유리구슬·부치지 못한 편지 …) — 늘 마른 모래라 물때와 상관없어요
//  - 갯바위 둘레 조약돌·광석 = 언덕(hill) 광석 — 만조 물가(TIDE_HIGH_Y 538)보다 뭍 쪽이라 물에 잠기지 않아요
//  - 갯벌 구멍(clam)을 넷 더 (그림은 지점 그림만 — 물이 빠졌을 때만 캐요, protocol seaDigOpen)
// 서 있을 수 있고 정류장에서 걸어서 닿는지·자리·별장 터·데크·서로와 떨어졌는지는 lib/forage/gatherBoost.test가 봐요.
// game/sea/* 는 고치지 않아요 (Foraging이 map "sea" 지점을 그대로 그려요).

/** id = s + 종류 첫 글자 + 좌표 (갯벌 구멍 sc… 와 같은 규칙, 마을·캠핑장 id와 겹치지 않아요) */
const seaNode = (kind: NodeKind, where: Where, x: number, y: number): GatherNode => ({ id: `s${kind[0]}${x}_${y}`, kind, where, x, y, map: "sea" });

export const SEA_LAND_NODES: readonly GatherNode[] = [
  // 곤충 수풀 (8): 별장 사이 풀밭 넷 · 동쪽 소나무 풀밭 둘 · 서쪽 풀밭 · 서쪽·동쪽 모래 언덕(야자수 발치)
  seaNode("bug", "meadow", 416, 150),
  seaNode("bug", "meadow", 560, 262),
  seaNode("bug", "meadow", 1196, 140),
  seaNode("bug", "meadow", 60, 204), // 11/19 7번 터가 생겨 서쪽 끝으로
  seaNode("bug", "forest", 1300, 230),
  seaNode("bug", "forest", 1560, 250),
  seaNode("bug", "meadow", 90, 436),
  seaNode("bug", "meadow", 1716, 450),
  // 약초 (5): 별장 정원(정원 벤치 둘레) · 부동산 옆 · 해먹 야자수 아래 · 동쪽 소나무 풀밭
  seaNode("herb", "meadow", 900, 212),
  seaNode("herb", "meadow", 1180, 236),
  seaNode("herb", "meadow", 796, 240),
  seaNode("herb", "meadow", 380, 352),
  seaNode("herb", "forest", 1700, 290), // 11/19 11번 터가 생겨 아래로
  // 모래 파 보기 (4): 선베드 줄을 비킨 백사장
  seaNode("dig", "lakeside", 714, 392),
  seaNode("dig", "lakeside", 1044, 350),
  seaNode("dig", "lakeside", 1350, 470),
  seaNode("dig", "lakeside", 324, 482),
  // 갯바위 광석 (4): 별장 언덕 아래 바위 · 방파제 쪽 바위 곶 · 동쪽 갯바위 · 서쪽 바위 해안 (모두 바위 위쪽 마른 자리)
  seaNode("ore", "hill", 250, 494),
  seaNode("ore", "hill", 1318, 494),
  seaNode("ore", "hill", 1560, 496),
  seaNode("ore", "hill", 70, 506),
  // 갯벌 구멍 (4 더): 물이 빠진 동안 내내 드러나는 줄 (y < 593)
  seaNode("clam", "flat", 746, 548),
  seaNode("clam", "flat", 560, 590),
  seaNode("clam", "flat", 596, 534),
  seaNode("clam", "flat", 1210, 582),
];
