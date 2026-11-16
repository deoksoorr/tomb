import {
  SEA_BOARD,
  SEA_BOARDWALK,
  SEA_BOAT,
  SEA_BOUNDS,
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_BUS_SIGN,
  SEA_BUS_STOP,
  SEA_BUS_TIMETABLE,
  SEA_DEEP_Y,
  SEA_FLAT_Y0,
  SEA_FURNITURE,
  SEA_GULL_PERCHES,
  SEA_HEIGHT,
  SEA_HILL_H,
  SEA_KIOSK,
  SEA_LIGHTHOUSE,
  SEA_LIGHTHOUSE_DOOR,
  SEA_LIGHTHOUSE_H,
  SEA_LOTS,
  SEA_LOT_BRANCH,
  SEA_LOT_LANE,
  seaLotFront,
  seaLotGate,
  SEA_PIER,
  SEA_PIER_END,
  SEA_REALTY,
  SEA_REALTY_DOOR,
  SEA_REALTY_H,
  SEA_REALTY_W,
  SEA_ROAD,
  onSeaRoad,
  SEA_SAND_Y0,
  SEA_SHELTER_H,
  SEA_SPOTS,
  SEA_MATS,
  SEA_EDGE_SEATS,
  seaLoungerCollider,
  SEA_TIDE_POOLS,
  SEA_WIDTH,
  seaColliders,
  type Furniture,
} from "@tomb/protocol";
import type { SeaInteractable, SeaLight } from "./seaTypes";

// 11/16 달물결 포구 배치 (순수 데이터 — Phaser 없음, seaLayout.test가 충돌·길을 검사해요).
// 큰 충돌 상자(건물·울타리·바위·난간·먼바다)는 protocol seaColliders가 원본이고, 여기서는 나무·가로등·상자 같은 작은 것만 더해요.
// 바닥 종류(seaGroundKind)는 그림(seaArt)·미니맵이 같이 봐요. 갯벌은 물때와 상관없이 늘 "flat"이에요 (물은 SeaMap이 위에 덮어 그려요).

export type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** 결정적 해시 → [0,1) (캠핑장 hashU와 같은 식) */
export function hashU(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

// ── 길 (흙길, 바닥 장식) ──
export type SeaPath = { id: string; hw: number; pts: readonly Pt[] };
export const SEA_PATHS: readonly SeaPath[] = [
  // 정류장에서 산책로까지 (내리면 이 길로 내려가요)
  // 11/16 r11 뭍을 줄이며 짧게 (6번 별장 서쪽 출입구 옆을 지나요)
  { id: "stop", hw: 10, pts: [ { x: SEA_BUS_STOP.x, y: SEA_ROAD.y + SEA_ROAD.h }, { x: SEA_BUS_STOP.x - 4, y: 220 }, { x: 1080, y: 280 }, { x: 1080, y: SEA_BOARDWALK.y + 2 } ] },
  // 부동산 문 앞에서 산책로까지
  { id: "realty", hw: 9, pts: [ { x: SEA_REALTY_DOOR.x, y: SEA_REALTY_DOOR.y - 4 }, { x: SEA_REALTY_DOOR.x, y: SEA_BOARDWALK.y + 2 } ] },
  // 11/16 r11 위쪽 별장으로 가는 오솔길 · 아래쪽 별장 사이 디딤돌 골목
  { id: "lotLane", hw: 8, pts: SEA_LOT_LANE },
  { id: "lotBranch", hw: 6, pts: SEA_LOT_BRANCH },
  // 남쪽 출입구 터 → 산책로 (짧은 발길)
  ...SEA_LOTS.filter((l) => l.gate === "s").map((l): SeaPath => ({ id: `lot${l.n}`, hw: 6, pts: [ seaLotFront(l, 2), { x: seaLotGate(l).x, y: SEA_BOARDWALK.y + 2 } ] })),
  // 동·서 출입구 터 → 골목
  ...SEA_LOTS.filter((l) => l.gate !== "s").map((l): SeaPath => {
    const g = seaLotFront(l, 2);
    return { id: `lot${l.n}`, hw: 6, pts: [ g, { x: g.x + (l.gate === "e" ? 22 : -22), y: g.y + 30 } ] };
  }),
];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L)) : 0;
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}
/** 가장 가까운 길 가장자리까지 (안이면 음수) */
export function pathEdgeDist(x: number, y: number): number {
  let best = Infinity;
  for (const p of SEA_PATHS) for (let i = 1; i < p.pts.length; i++) best = Math.min(best, segDist(x, y, p.pts[i - 1], p.pts[i]) - p.hw);
  return best;
}

// ── 바닥 종류 ──
export type SeaGround = "hill" | "grass" | "platform" | "road" | "path" | "yard" | "lot" | "boardwalk" | "sand" | "flat" | "pool" | "deep";

/** 정류장 승강장 (포장 바닥, 지붕·팻말·시간표가 이 위에 서요) */
export const SEA_PLATFORM: Rect = { x: SEA_BUS_TIMETABLE.x - 22, y: SEA_HILL_H, w: SEA_BUS_SIGN.x + 32 - (SEA_BUS_TIMETABLE.x - 22), h: SEA_ROAD.y - SEA_HILL_H };

/** (x,y)가 물웅덩이 안인지 (0 밖 ~ 1 가운데) */
export function poolDepth(x: number, y: number): number {
  let best = 0;
  for (const p of SEA_TIDE_POOLS) {
    const d = ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2;
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return best;
}

/** 바닥 종류 (그림·미니맵 공통). 경계 흔들림은 결정적 해시로 */
/** 돌림 마당 둘레는 나무를 비워요 (버스가 도는 자리) */
const SEA_ROAD_LOOP_PAD = 60;

export function seaGroundKind(x: number, y: number): SeaGround {
  const wob = (hashU(x >> 2, y >> 2, 7) - 0.5) * 3;
  if (y >= SEA_DEEP_Y + wob * 0.6) return "deep";
  if (y >= SEA_FLAT_Y0 + wob) return poolDepth(x, y) > 0 ? "pool" : "flat";
  if (y >= SEA_SAND_Y0) return "sand";
  if (inRect(SEA_BOARDWALK, x, y)) return "boardwalk";
  if (y < SEA_HILL_H - 2 + wob * 1.4) return "hill";
  if (inRect(SEA_PLATFORM, x, y)) return "platform";
  if (onSeaRoad(x, y)) return "road";
  for (const l of SEA_LOTS) if (inRect(l, x, y, -2)) return "lot";
  if (pathEdgeDist(x, y) <= wob * 0.6) return "path";
  return "grass";
}

// ── 나무·장식 ──
export type SeaTreeKind = "pine" | "palm" | "bush";
export type SeaTree = { kind: SeaTreeKind; x: number; y: number; v: number };
export type SeaDecorKind = "beachGrass" | "shell" | "drift" | "flower" | "stone";
/** 11/16 갯바위 둘레 게 둘 (물이 빠졌을 때만 나와요) */
export const SEA_CRABS: readonly Pt[] = [
  { x: 1070, y: 566 },
  { x: 128, y: 612 },
];
export type SeaDecor = { kind: SeaDecorKind; x: number; y: number; v: number };

/** 해먹을 걸 야자수 둘 (다음 차수에 그 사이에 해먹을 걸어요) */
export const SEA_PALMS: readonly Pt[] = [
  { x: SEA_SPOTS.hammock.x - 30, y: SEA_SPOTS.hammock.y - 2 },
  { x: SEA_SPOTS.hammock.x + 30, y: SEA_SPOTS.hammock.y - 2 },
];
/** 산책로 가로등 (산책로 위쪽 가장자리) */
export const SEA_LAMPS: readonly Pt[] = [80, 240, 400, 712, 880, 1040, 1232].map((x) => ({ x, y: SEA_BOARDWALK.y + 2 }));
/** 생선 상자 더미 (매점 옆) · 그물 말리는 틀 (11/16 r11 시장을 빼며 상자는 매점 옆 하나만) */
export const SEA_CRATES: readonly Pt[] = [{ x: SEA_KIOSK.x + 40, y: SEA_KIOSK.y - 2 }];
export const SEA_NET_RACK: Pt = { x: 1000, y: 276 };
/** 테트라포드 (방파제 양옆과 끝 둘레 — 그림만, 막는 건 protocol 난간) */
export const SEA_TETRAPODS: readonly (Pt & { v: number })[] = (() => {
  const out: (Pt & { v: number })[] = [];
  const B = SEA_BREAKWATER;
  let i = 0;
  for (let y = SEA_FLAT_Y0 + 14; y < B.y + B.h - 4; y += 17) {
    out.push({ x: B.x - 9, y, v: i++ % 3 });
    out.push({ x: B.x + B.w + 9, y: y + 8, v: i++ % 3 });
  }
  return out;
})();
/** 선착장 말뚝 (양옆, 갈매기가 앉아요). 갈매기 자리(SEA_GULL_PERCHES) 중 선착장 옆 것은 꼭 말뚝이에요 */
export const SEA_PIER_POSTS: readonly Pt[] = (() => {
  const P = SEA_PIER;
  const onSide = (p: Pt) => p.y > SEA_FLAT_Y0 && p.y < P.y + P.h && (Math.abs(p.x - (P.x - 4)) < 3 || Math.abs(p.x - (P.x + P.w + 4)) < 3);
  const out: Pt[] = SEA_GULL_PERCHES.filter(onSide).map((p) => ({ x: p.x, y: p.y }));
  for (let y = SEA_FLAT_Y0 + 24; y <= P.y + P.h - 10; y += 36)
    for (const x of [P.x - 4, P.x + P.w + 4]) {
      const yy = x < P.x ? y : y + 30;
      if (yy > P.y + P.h - 10 || out.some((q) => q.x === x && Math.abs(q.y - yy) < 34)) continue;
      out.push({ x, y: yy });
    }
  return out;
})();

export function treeCollider(t: SeaTree): Rect {
  return t.kind === "bush" ? { x: t.x - 7, y: t.y - 4, w: 14, h: 4 } : { x: t.x - 3, y: t.y - 4, w: 6, h: 4 };
}

/** 나무·장식을 비켜야 하는 곳 (길·출입구·건물 앞·다음 차수 자리) */
function keepClear(x: number, y: number, pad: number): boolean {
  if (pathEdgeDist(x, y) < pad) return true;
  if (inRect(SEA_PLATFORM, x, y, pad)) return true;
  if (inRect({ x: SEA_REALTY.x - SEA_REALTY_W / 2, y: SEA_REALTY.y - SEA_REALTY_H, w: SEA_REALTY_W, h: SEA_REALTY_H + 20 }, x, y, pad)) return true;
  for (const l of SEA_LOTS) if (inRect(l, x, y, pad + 6)) return true;
  if (Math.hypot(x - SEA_NET_RACK.x, y - SEA_NET_RACK.y) < 34 + pad) return true;
  return false;
}

function buildTrees(): SeaTree[] {
  const out: SeaTree[] = [];
  // 뒤 언덕 소나무 (막힌 언덕 안 — 줄기 충돌은 따로 필요 없어요). 정류장 지붕 뒤는 낮은 덤불로
  for (let x = 10, i = 0; x < SEA_WIDTH; x += 26 + Math.floor(hashU(i, 1, 3) * 16), i++) {
    const y = 30 + Math.floor(hashU(i, 2, 3) * 22);
    const behindStop = Math.abs(x - SEA_BUS_STOP.x) < 70;
    out.push({ kind: behindStop ? "bush" : "pine", x, y: behindStop ? 46 : y, v: i % 2 });
  }
  // 오른쪽 풀밭 소나무 몇 그루 (정류장 길을 비켜서)
  for (let i = 0; i < 40 && out.length < 60; i++) {
    const x = 990 + Math.floor(hashU(i, 5, 11) * 260);
    const y = 170 + Math.floor(hashU(i, 6, 11) * (SEA_BOARDWALK.y - 190));
    if (x > SEA_BOUNDS.maxX - 6 || keepClear(x, y, 22)) continue;
    if (out.some((t) => t.y > 100 && Math.hypot(t.x - x, t.y - y) < 40)) continue;
    out.push({ kind: hashU(i, 7, 11) < 0.25 ? "bush" : "pine", x, y, v: i % 2 });
  }
  // 왼쪽 위·부동산 옆 덤불
  for (const p of [
    { x: 540, y: 186 },
    { x: 690, y: 190 },
    { x: 180, y: 296 },
  ])
    if (!keepClear(p.x, p.y, 6)) out.push({ kind: "bush", x: p.x, y: p.y, v: 1 });
  for (const p of SEA_PALMS) out.push({ kind: "palm", x: p.x, y: p.y, v: 0 });
  // 11/16 별장 언덕 야자수 둘 (산책로 위 가장자리) · r11 별장마다 정원 덤불 한두 그루 (울타리 옆)
  out.push({ kind: "palm", x: 534, y: 300, v: 0 }, { kind: "palm", x: 22, y: 300, v: 0 });
  for (const l of SEA_LOTS)
    for (const [dx, dy] of [
      [-12, 10],
      [l.w + 12, l.h - 6],
    ]) {
      const x = l.x + dx;
      const y = l.y + dy;
      if (x < 24 || x > SEA_BOUNDS.maxX - 8 || keepClear(x, y, 2) || out.some((t) => Math.hypot(t.x - x, t.y - y) < 20)) continue;
      out.push({ kind: "bush", x, y, v: Math.abs(l.n + dx) % 2 });
    }
  // 11/16 버스 길을 줄인 자리 (맨 위 띠, 돌림 마당 왼쪽): 둥근 나무와 덤불을 번갈아
  for (let x = 30, i = 0; x < SEA_ROAD.x - SEA_ROAD_LOOP_PAD; x += 46 + Math.floor(hashU(i, 41, 3) * 30), i++) {
    const y = 92 + Math.floor(hashU(i, 42, 3) * 48);
    if (keepClear(x, y, 16)) continue;
    out.push({ kind: hashU(i, 43, 3) < 0.4 ? "bush" : "pine", x, y, v: i % 2 });
  }
  // 11/16 시안: 풀밭 곳곳에 둥근 덤불 (사용자가 마음에 들어 했어요) — 건물·터·길·정류장을 비켜서
  for (let i = 0; i < 90 && out.filter((t) => t.kind === "bush").length < 30; i++) {
    const x = 24 + Math.floor(hashU(i, 31, 13) * (SEA_WIDTH - 48));
    const y = SEA_ROAD.y + SEA_ROAD.h + 16 + Math.floor(hashU(i, 32, 13) * (SEA_BOARDWALK.y - SEA_ROAD.y - SEA_ROAD.h - 28));
    if (keepClear(x, y, 14)) continue;
    if (SEA_LOTS.some((l) => x > l.x - 14 && x < l.x + l.w + 14 && y > l.y - 14 && y < l.y + l.h + 18)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.y - y) < 34)) continue;
    out.push({ kind: "bush", x, y, v: i % 2 });
  }
  return out;
}

/** 11/16 쉴거리(벤치·선베드·파라솔·돗자리) 둘레에는 조개·풀을 두지 않아요 */
function nearRest(x: number, y: number, pad: number): boolean {
  for (const b of SEA_SPOTS.benches) if (Math.abs(x - b.x) < 22 + pad && y > b.y - 12 - pad && y < b.y + pad) return true;
  for (const l of SEA_SPOTS.loungers) if (Math.abs(x - l.x) < 12 + pad && y > l.y - 44 - pad && y < l.y + pad) return true;
  for (const p of SEA_SPOTS.parasols) if (Math.abs(x - p.x) < 24 + pad && Math.abs(y - p.y) < 14 + pad) return true;
  for (const m of SEA_MATS) if (Math.abs(x - m.x) < 24 + pad && Math.abs(y - m.y) < 14 + pad) return true;
  return false;
}

function buildDecor(): SeaDecor[] {
  const out: SeaDecor[] = [];
  // 백사장 위쪽 갯그령 (산책로 아래), 조개껍데기·떠밀려 온 나무
  for (let i = 0; i < 60; i++) {
    const x = 16 + Math.floor(hashU(i, 1, 21) * (SEA_WIDTH - 32));
    const y = SEA_SAND_Y0 + 6 + Math.floor(hashU(i, 2, 21) * 28);
    if (Math.abs(x - (SEA_PIER.x + SEA_PIER.w / 2)) < 40) continue;
    if (nearRest(x, y, 18)) continue;
    out.push({ kind: "beachGrass", x, y, v: i % 3 });
  }
  // 11/16 파스텔 정리: 조개·떠밀려 온 나무를 절반쯤으로 줄여 모래를 깨끗하게 (떠밀려 온 나무는 드물게)
  for (let i = 0; i < 46; i++) {
    if (hashU(i, 9, 23) < 0.5) continue;
    const x = 20 + Math.floor(hashU(i, 3, 23) * (SEA_WIDTH - 40));
    const y = SEA_SAND_Y0 + 44 + Math.floor(hashU(i, 4, 23) * (SEA_FLAT_Y0 - SEA_SAND_Y0 - 50));
    if (nearRest(x, y, 14)) continue;
    out.push({ kind: hashU(i, 5, 23) < 0.06 ? "drift" : "shell", x, y, v: i % 3 });
  }
  // 11/16 오두막 골목 디딤돌 (가지 골목을 따라) · 터 둘레 갯그령 덤불
  for (let i = 1; i < SEA_LOT_BRANCH.length; i++) {
    const a = SEA_LOT_BRANCH[i - 1];
    const b = SEA_LOT_BRANCH[i];
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 18);
    for (let k = 0; k < n; k++) out.push({ kind: "stone", x: Math.round(a.x + ((b.x - a.x) * (k + 0.5)) / n), y: Math.round(a.y + ((b.y - a.y) * (k + 0.5)) / n) + (k % 2 ? 2 : -2), v: k });
  }
  // r11 별장마다 출입구 양옆 갯그령 (작은 정원)
  for (const l of SEA_LOTS) {
    const g = seaLotGate(l);
    const side = l.gate === "s" ? [ { x: g.x - 24, y: g.y + 6 }, { x: g.x + 24, y: g.y + 6 } ] : [ { x: g.x - 8, y: g.y - 22 }, { x: g.x - 8, y: g.y + 26 } ];
    for (const p of side) if (!keepClear(p.x, p.y, 0)) out.push({ kind: "beachGrass", x: p.x, y: p.y, v: (p.x >> 3) % 3 });
  }
  // 풀밭 들꽃 (해당화 빛)
  for (let i = 0; i < 40; i++) {
    const x = 20 + Math.floor(hashU(i, 6, 25) * (SEA_WIDTH - 40));
    const y = SEA_ROAD.y + SEA_ROAD.h + 8 + Math.floor(hashU(i, 7, 25) * (SEA_BOARDWALK.y - SEA_ROAD.y - SEA_ROAD.h - 14));
    if (keepClear(x, y, 4)) continue;
    out.push({ kind: "flower", x, y, v: i % 3 });
  }
  return out;
}

export const SEA_TREES: readonly SeaTree[] = buildTrees();
export const SEA_DECOR: readonly SeaDecor[] = buildDecor();

// ── 충돌 ──

/** 부동산 앞 꽃밭 (protocol 몸통 앞 그림 자리) */
export function seaFrontColliders(): Rect[] {
  return [
    // 부동산 앞 꽃밭 (문 계단은 비워요)
    { x: SEA_REALTY.x - SEA_REALTY_W / 2 + 4, y: SEA_REALTY.y - 6, w: 44, h: 5 },
    { x: SEA_REALTY.x + SEA_REALTY_W / 2 - 48, y: SEA_REALTY.y - 6, w: 44, h: 5 },
  ];
}

/** 막히는 것 전부 (protocol 큰 상자 + 나무·가로등·상자·그물 틀) */
export function seaStaticColliders(): Rect[] {
  return [
    ...seaColliders(),
    ...seaFrontColliders(),
    ...SEA_TREES.filter((t) => t.y > SEA_HILL_H).map(treeCollider),
    ...SEA_LAMPS.map((p) => ({ x: p.x - 2, y: p.y - 3, w: 4, h: 3 })),
    ...SEA_CRATES.map((p) => ({ x: p.x - 9, y: p.y - 5, w: 18, h: 5 })),
    { x: SEA_NET_RACK.x - 24, y: SEA_NET_RACK.y - 4, w: 48, h: 4 },
  ];
}

/** 의자·벤치 (점프 중엔 넘어요) */
// 11/16 앉는 모습이 어색했어요 → 막는 상자를 캠핑장 벤치와 같게 (그림 폭 40, 앉는 판 깊이 7) — 위에서 다가와 판 속에 서 있다가 앉으며 판을 뚫고 내려오지 않게
export function seaFurnitureCollider(f: Furniture): Rect {
  if (f.kind === "bench") return { x: f.x - 20, y: f.y - 7, w: 40, h: 7 };
  return { x: f.x - 6, y: f.y - 6, w: 12, h: 6 };
}
/** 11/16 끝 걸터앉기는 그림·충돌이 없어요 (데크 끝). 파라솔은 기둥만 막아요 (선베드·돗자리는 낮아서 지나가요) */
export function seaFurnitureColliders(): Rect[] {
  // 11/16 선베드도 막아요 (사용자: 선베드 위를 걸어 지나가요 — 눕기로만 올라가요)
  return [
    ...SEA_FURNITURE.filter((f) => !SEA_EDGE_SEATS.includes(f.id)).map(seaFurnitureCollider),
    ...SEA_SPOTS.parasols.map((p) => ({ x: p.x - 2, y: p.y - 3, w: 4, h: 3 })),
    ...SEA_SPOTS.loungers.map(seaLoungerCollider),
  ];
}

let standRects: Rect[] | null = null;
/** 발 상자(8×5, 발바닥이 아랫변)를 (x,y)에 놓아 맵 안이고 어떤 충돌에도 닿지 않는지 (갯벌은 물때와 상관없이 걸어요) */
export function seaStandable(x: number, y: number): boolean {
  const b = SEA_BOUNDS;
  if (!(x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY)) return false;
  standRects ??= [...seaStaticColliders(), ...seaFurnitureColliders()];
  const fx = x - 4;
  const fy = y - 5;
  for (const r of standRects) if (fx < r.x + r.w && fx + 8 > r.x && fy < r.y + r.h && fy + 5 > r.y) return false;
  return true;
}

/** 걷기 격자 (cell px, 0 = 걸을 수 있음, 1 = 막힘). 칸 가운데에 발 상자를 놓아 판정 */
export type SeaWalkGrid = { cell: number; cols: number; rows: number; cells: Uint8Array };
export function seaWalkGrid(cell = 8): SeaWalkGrid {
  const cols = Math.ceil(SEA_WIDTH / cell);
  const rows = Math.ceil(SEA_HEIGHT / cell);
  const cells = new Uint8Array(cols * rows);
  const b = SEA_BOUNDS;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * cell + cell / 2;
      const py = y * cell + cell / 2;
      if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) cells[y * cols + x] = 1;
    }
  const block = (r: Rect) => {
    const c0 = Math.max(0, Math.ceil((r.x - 4 - cell / 2) / cell));
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w + 4 - cell / 2) / cell));
    const r0 = Math.max(0, Math.ceil((r.y - cell / 2) / cell));
    const r1 = Math.min(rows - 1, Math.floor((r.y + r.h + 5 - cell / 2) / cell));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) cells[y * cols + x] = 1;
  };
  for (const r of [...seaStaticColliders(), ...seaFurnitureColliders()]) block(r);
  return { cell, cols, rows, cells };
}

/** 11/16 등대지기 (방파제 끝 데크, 등대 오른쪽) */
export const SEA_KEEPER: Pt = { x: SEA_BREAKWATER_TIP.x + 80, y: SEA_BREAKWATER_TIP.y + 64 };

// ── 상호작용 ──
export const SEA_INTERACTABLES: readonly SeaInteractable[] = [
  { id: "bus:village", kind: "bus", x: SEA_BOARD.x, y: SEA_BOARD.y, r: 22, label: "마을행 버스 타기" },
  { id: "sign", kind: "sign", x: SEA_BUS_SIGN.x, y: SEA_BUS_SIGN.y + 12, r: 18, label: "표지판 보기" },
  ...SEA_LOTS.map((l): SeaInteractable => {
    const f = seaLotFront(l);
    return { id: `lot:${l.n}`, kind: "lot", lot: l.n, x: f.x, y: f.y, r: 20, label: `${l.n}번 별장 터` };
  }),
  { id: "realty", kind: "realty", x: SEA_REALTY_DOOR.x, y: SEA_REALTY_DOOR.y + 4, r: 22, label: "포구 부동산" },
  { id: "kiosk", kind: "kiosk", x: SEA_KIOSK.x, y: SEA_KIOSK.y + 12, r: 20, label: "매점" },
  { id: "lighthouse", kind: "lighthouse", x: SEA_LIGHTHOUSE_DOOR.x, y: SEA_LIGHTHOUSE_DOOR.y + 6, r: 18, label: "등대 오르기" },
  { id: "keeper", kind: "keeper", x: SEA_KEEPER.x, y: SEA_KEEPER.y + 8, r: 20, label: "등대지기와 이야기하기" },
  { id: "boat", kind: "boat", x: SEA_PIER_END.x + SEA_PIER_END.w - 8, y: SEA_BOAT.y, r: 20, label: "낚싯배" },
];

// ── 밤 빛 ──
/** 등대 등불 자리 (등대 그림의 등실) */
export const SEA_LIGHTHOUSE_LAMP = { x: SEA_LIGHTHOUSE.x, y: SEA_LIGHTHOUSE.y - SEA_LIGHTHOUSE_H + 18 } as const;
export const SEA_LIGHTS: readonly SeaLight[] = [
  // 정류장 지붕 등 · 시간표 불빛
  { x: SEA_BUS_STOP.x, y: SEA_BUS_STOP.y - SEA_SHELTER_H + 12, scale: 0.85, tint: 0xfff0c8, base: 0.85 },
  { x: SEA_BUS_TIMETABLE.x, y: SEA_BUS_TIMETABLE.y - 18, scale: 0.4, tint: 0xd8f0ff, base: 0.6 },
  // 부동산 창 · 매점 창구
  { x: SEA_REALTY.x - 34, y: SEA_REALTY.y - 26, scale: 0.55, tint: 0xffe0a0, base: 0.75 },
  { x: SEA_KIOSK.x, y: SEA_KIOSK.y - 24, scale: 0.7, tint: 0xffe6b0, base: 0.85 },
  // 산책로 가로등
  ...SEA_LAMPS.map((p) => ({ x: p.x, y: p.y - 30, scale: 0.8, tint: 0xffe2a8, base: 0.7 })),
  // 등대 등불
  { x: SEA_LIGHTHOUSE_LAMP.x, y: SEA_LIGHTHOUSE_LAMP.y, scale: 1.4, tint: 0xfff4c8, base: 1 },
];

/** 구역 이름표 자리 (사각형 위쪽 가운데가 어색한 곳만) */
export const SEA_ZONE_LABEL_AT: Partial<Record<string, Pt>> = {
  별장: { x: 480, y: 120 },
  백사장: { x: 160, y: SEA_SAND_Y0 + 60 },
  갯벌: { x: 470, y: SEA_FLAT_Y0 + 36 },
  선착장: { x: SEA_PIER.x + SEA_PIER.w / 2, y: SEA_PIER.y - 6 },
  방파제: { x: SEA_BREAKWATER.x + SEA_BREAKWATER.w / 2, y: SEA_BREAKWATER.y - 6 },
  갯바위: { x: 110, y: 516 },
};
/** 이름표 표에서 자리 찾기 (띄어쓰기 없이 비교) */
export function zoneLabelAt(name: string): Pt | undefined {
  return SEA_ZONE_LABEL_AT[name.replace(/\s/g, "")];
}

/** 해먹 자리 등 다음 차수 쉴거리 자리는 비어 있어야 해요 (테스트용) */
// 11/16 벤치·파라솔은 이제 진짜 자리 (막는 상자가 있어요) → 앉는 자리는 SEA_REST_SEATS·SEA_SEATS 테스트에서
export const SEA_FUTURE_SPOTS: readonly Pt[] = [
  SEA_SPOTS.swing,
  SEA_SPOTS.bonfire,
  ...SEA_SPOTS.sandcastles,
];
