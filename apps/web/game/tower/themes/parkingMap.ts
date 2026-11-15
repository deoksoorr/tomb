import { seeded } from "@/lib/rpg/formulas";
import { css, darken, hash2, lighten, type Color } from "../../sprites/pixel";

// 11/15 지하 주차장 지도: 방 여덟 가지 배치(layout.ts MAKE가 부른다) + 바닥·벽·소품 그림(arena/art.ts가 부른다). Phaser 없음.
// 어느 층이 어느 방인지는 lib/rpg/towerThemes/parking pkRoom(판 시드·층). 움직이는 것(형광등 깜빡임·비상등·기름 무지개·물방울·헤드라이트 돌진·층 번호)은 parkingStage.ts.
// 차가 지나가는 통로(pkLanes)는 소품이 막지 않는다 — 돌진하는 차가 그 줄로 지나간다 (parkingMap.test가 확인).
// 순환 참조를 피하려고 layout.ts·art.ts를 가져오지 않는다 → 지도 크기는 여기 숫자를 같이 쓴다.

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };
type Decal = { kind: string; x: number; y: number; w: number; h: number; v?: number };
/** art.ts가 넘기는 지도 (layout.ts ArenaLayout 중 쓰는 것만) */
type L = { variant: number; decals: readonly Decal[] };

function R(c: Ctx, x: number, y: number, w: number, h: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function E(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const t = (y + 0.5 - cy) / ry;
    if (t * t > 1) continue;
    const half = rx * Math.sqrt(1 - t * t);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

// ── 3×5 도트 글자 (기둥 칠·층 번호·바닥 글씨) ──

const GLYPHS: Record<string, string> = {
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001111",
  A: "010101111101101",
  B: "110101110101110",
  C: "111100100100111",
  D: "110101101101110",
  E: "111100111100111",
  F: "111100110100100",
  I: "111010010010111",
  L: "100100100100111",
  O: "111101101101111",
  P: "111101111100100",
  S: "111100111001111",
  T: "111010010010010",
  W: "101101101111101",
  X: "101101010101101",
  "-": "000000111000000",
};
/** 3×5 글자 (scale배, 글자 사이 1칸). 그린 폭을 돌려준다 */
export function pkText(c: Ctx, text: string, x: number, y: number, col: Color, scale = 1, a = 1): number {
  let ox = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") R(c, ox + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, col, a);
    ox += 4 * scale;
  }
  return Math.max(0, ox - x - scale);
}

// ── 차가 지나가는 통로 (헤드라이트 돌진) ──

/** 통로: hor면 가로줄 (가운데 y = at), 아니면 세로줄 (가운데 x = at). 폭 PK_RUSH.width(26)보다 넉넉히 비워 둔다 */
export type PkLane = { hor: boolean; at: number };
const LANES: readonly (readonly PkLane[])[] = [
  [{ hor: true, at: 158 }],
  [
    { hor: false, at: 224 },
    { hor: true, at: 232 },
  ],
  [
    { hor: true, at: 112 },
    { hor: true, at: 218 },
  ],
  [
    { hor: true, at: 134 },
    { hor: false, at: 128 },
    { hor: false, at: 320 },
  ],
  [{ hor: true, at: 164 }],
  [
    { hor: false, at: 224 },
    { hor: true, at: 96 },
  ],
  [{ hor: true, at: 206 }],
  [
    { hor: true, at: 104 },
    { hor: true, at: 214 },
    { hor: false, at: 224 },
  ],
];
export const pkLanes = (v: number): readonly PkLane[] => LANES[Math.max(0, Math.min(LANES.length - 1, Math.floor(v)))];
/** 통로 칠 폭 (돌진 판정 폭보다 조금 넓게) */
export const PK_LANE_W = 32;

/** 벽에 붙은 비상구 표시등 자리 (빛은 게임이 깜빡인다) — 방마다 */
export function pkExitSigns(v: number): Pt[] {
  return v === 1 ? [{ x: 60, y: 12 }] : v === 7 ? [{ x: 34, y: 12 }, { x: 414, y: 12 }] : [{ x: 52, y: 12 }, { x: 396, y: 12 }];
}

/** 천장 형광등 줄 (가로 y) — 게임이 깜빡이게 그린다 */
export const PK_TUBE_ROWS = [62, 150, 238] as const;

// ── 배치 ──

/** layout.ts Builder 중 여기서 쓰는 것 */
type B = {
  start: Pt;
  prop(kind: string, x: number, y: number, extra?: { flip?: boolean; v?: number }): B;
  decal(kind: string, x: number, y: number, w: number, h: number, v?: number): B;
  light(x: number, y: number, r: number, color: number, flicker?: boolean): B;
  spawn(...pts: [number, number][]): B;
};

const Rs = (dx: number, dy: number, w: number, h: number) => ({ t: "r" as const, dx, dy, w, h });
const Cs = (dx: number, dy: number, r: number) => ({ t: "c" as const, dx, dy, r });

/** 소품 크기·충돌 (layout.ts PROP_META에 펼쳐 넣는다) */
export const PK_PROP_META = {
  // 주차된 차 (앞이나 뒤가 보인다 — 칸에 세로로 선 차): 차 길이만큼 막는다
  pk_car: { w: 30, h: 46, solid: Rs(-14, -38, 28, 36) },
  // 옆으로 선 차
  pk_car_side: { w: 54, h: 28, solid: Rs(-25, -13, 50, 12) },
  pk_pillar: { w: 20, h: 46, solid: Rs(-9, -12, 18, 11) },
  pk_booth: { w: 38, h: 46, solid: Rs(-17, -14, 34, 13) },
  pk_gate: { w: 12, h: 30, solid: Cs(0, -3, 4) },
  pk_charger: { w: 14, h: 32, solid: Rs(-6, -8, 12, 7) },
  pk_brush: { w: 22, h: 42, solid: Rs(-10, -10, 20, 9) },
  pk_pallet: { w: 30, h: 26, solid: Rs(-14, -10, 28, 9) },
  pk_corral: { w: 42, h: 20, solid: Rs(-20, -8, 40, 7) },
  pk_bollard: { w: 6, h: 14, solid: Cs(0, -2, 3) },
  pk_cones: { w: 18, h: 14 },
  pk_wreck: { w: 46, h: 34, solid: Rs(-21, -14, 42, 13) },
  pk_fence: { w: 50, h: 28, solid: Rs(-25, -5, 50, 4) },
  pk_extinguisher: { w: 10, h: 18, solid: Rs(-4, -4, 8, 4) },
};

const EDGE: [number, number][] = [
  [36, 62],
  [AW - 36, 62],
  [36, AH - 26],
  [AW - 36, AH - 26],
];

/** 방 종류 v의 배치 (seed는 차 색·빈칸 같은 작은 흔들림). 출현 지점은 세운 차·기둥에 걸리지 않는 곳만 */
export function parkingLayout(out: B, v: number, seed: number): void {
  const solids: { x: number; y: number; w: number; h: number }[] = [];
  const cands: [number, number][] = [];
  const meta = PK_PROP_META as Record<string, { solid?: { t: "r"; dx: number; dy: number; w: number; h: number } | { t: "c"; dx: number; dy: number; r: number } }>;
  const b: B = {
    get start() {
      return out.start;
    },
    set start(p: Pt) {
      out.start = p;
    },
    prop(kind, x, y, extra) {
      out.prop(kind, x, y, extra);
      const so = meta[kind]?.solid;
      if (so) solids.push(so.t === "r" ? { x: x + so.dx, y: y + so.dy, w: so.w, h: so.h } : { x: x + so.dx - so.r, y: y + so.dy - so.r, w: so.r * 2, h: so.r * 2 });
      return b;
    },
    decal(kind, x, y, w, h, vv) {
      out.decal(kind, x, y, w, h, vv);
      return b;
    },
    light(x, y, r, color, flicker) {
      out.light(x, y, r, color, flicker);
      return b;
    },
    spawn(...pts) {
      cands.push(...pts);
      return b;
    },
  };
  const rv = (() => {
    const r = seeded((seed ^ 0x504b4c59) >>> 0);
    return Array.from({ length: 256 }, () => r());
  })();
  const s = (k: number) => rv[Math.abs(Math.floor(k)) & 255];
  const carV = (k: number, front: boolean) => Math.floor(s(k * 3 + 1) * 8) * 2 + (front ? 1 : 0);
  // 칸을 그리고 차를 세운다 (빈칸도 가끔). 뒤가 보이면 위쪽 줄, 앞이 보이면 아래쪽 줄
  const bayRow = (x0: number, n: number, y: number, front: boolean, gap: number[] = [], salt = 0, bw = 34) => {
    b.decal("pk_bays", x0, y - 44, n * bw, 46, (front ? 1 : 0) + bw * 2);
    for (let i = 0; i < n; i++) {
      if (gap.includes(i)) continue;
      if (s(salt + i * 7) < 0.14) continue;
      b.prop("pk_car", x0 + 17 + i * bw, y, { v: carV(salt + i, front) });
    }
  };
  const lanes = pkLanes(v);
  for (const l of lanes) {
    if (l.hor) b.decal("pk_lane", SIDE, l.at - PK_LANE_W / 2, AW - SIDE * 2, PK_LANE_W, 0);
    else b.decal("pk_lane", l.at - PK_LANE_W / 2, TOP, PK_LANE_W, AH - TOP - SIDE, 1);
  }
  const pillar = (x: number, y: number) => b.prop("pk_pillar", x, y, { v: v % 2 ? 3 : 2 });
  switch (v) {
    // B2 주차 구역: 위·아래 두 줄 주차 칸, 가운데 가로 통로, 칸 사이 기둥
    case 0: {
      // 벽에 붙은 열두 칸씩 두 줄 (칸 사이로는 못 지나간다), 기둥 넷은 통로 양옆에 따로 선다
      bayRow(14, 12, 70, false, [], 1, 35);
      bayRow(14, 12, 276, true, [], 31, 35);
      for (const x of [140, 308]) {
        pillar(x, 122);
        pillar(x, 208);
      }
      b.decal("pk_puddle", 210 + Math.round(s(9) * 40), 194, 34, 12, 0);
      b.decal("pk_puddle", 80, 120, 24, 9, 1);
      b.decal("pk_oil", 330, 186, 20, 8);
      b.prop("pk_cones", 400, 128).prop("pk_extinguisher", 20, 140);
      b.start = { x: AW / 2, y: 200 };
      b.spawn(...EDGE, [24, 158], [AW - 24, 158], [224, 120]);
      break;
    }
    // 경사로: 가운데 세로 경사로(위 벽 출구로 올라간다) + 아래 가로 통로, 양옆에 옆으로 선 차
    case 1: {
      b.decal("pk_ramp", 224 - 40, TOP, 80, 170);
      for (const y of [92, 152]) {
        b.prop("pk_car_side", 70, y, { v: carV(y, false) });
        b.prop("pk_car_side", AW - 70, y, { v: carV(y + 1, false), flip: true });
      }
      b.prop("pk_car_side", 70, 200, { v: carV(5, false) });
      b.prop("pk_pillar", 150, 120, { v: 2 }).prop("pk_pillar", 298, 120, { v: 2 });
      for (const y of [64, 110, 160]) b.prop("pk_bollard", 186, y).prop("pk_bollard", 262, y);
      b.decal("pk_hatch", 186, 254, 76, 18);
      b.decal("pk_puddle", 300, 190, 30, 10, 2);
      b.prop("pk_cones", 360, 268).prop("pk_corral", 92, 276);
      b.start = { x: AW / 2 + 70, y: 180 };
      b.spawn(...EDGE, [224, 44], [24, 232], [AW - 24, 232]);
      break;
    }
    // 정산소 앞: 들어오는 줄·나가는 줄, 가운데 섬에 정산소와 차단기 기둥
    case 2: {
      b.decal("pk_island", 150, 136, 148, 64);
      b.prop("pk_booth", 224, 182, { v: 0 });
      b.prop("pk_gate", 176, 140).prop("pk_gate", 272, 196, { flip: true });
      b.prop("pk_bollard", 158, 150).prop("pk_bollard", 290, 150).prop("pk_bollard", 158, 188).prop("pk_bollard", 290, 188);
      bayRow(30, 3, 92, false, [], 61);
      bayRow(316, 3, 92, false, [], 71);
      b.prop("pk_car_side", 70, 276, { v: carV(81, false) }).prop("pk_car_side", 378, 276, { v: carV(82, false), flip: true });
      b.decal("pk_cross", 100, 125, 24, 80);
      b.decal("pk_cross", 324, 125, 24, 80);
      b.decal("pk_puddle", 60, 160, 26, 9, 3);
      b.start = { x: 80, y: 172 };
      b.spawn(...EDGE, [24, 112], [AW - 24, 218], [224, 260]);
      break;
    }
    // 기둥 숲: 기둥이 빽빽한 넓은 칸, 세로 통로 둘·가로 통로 하나
    case 3: {
      for (const x of [72, 184, 264, 376])
        for (const y of [100, 184, 266]) {
          if ((x === 184 || x === 264) && y === 184) continue;
          pillar(x, y);
        }
      b.prop("pk_car_side", 224, 230, { v: carV(91, false) });
      b.prop("pk_car", 30, 266, { v: carV(92, true) }).prop("pk_car", AW - 30, 266, { v: carV(93, true) });
      b.decal("pk_puddle", 210, 170, 40, 12, 4);
      b.decal("pk_oil", 70, 140, 18, 7);
      b.decal("pk_oil", 360, 220, 22, 8);
      b.start = { x: AW / 2, y: 180 };
      b.spawn(...EDGE, [224, 44], [24, 134], [AW - 24, 134], [224, 268]);
      break;
    }
    // 전기차 충전 구역: 초록 칸 + 충전기 (위 줄), 아래 줄은 옆으로 선 차
    case 4: {
      b.decal("pk_ev", 40, 46, 368, 50);
      for (let i = 0; i < 6; i++) {
        const x = 70 + i * 62;
        b.prop("pk_charger", x - 20, 96);
        if (s(100 + i) < 0.8) b.prop("pk_car", x + 6, 98, { v: carV(100 + i, false) });
      }
      for (const x of [90, 224, 358]) b.prop("pk_car_side", x, 262, { v: carV(x, false), flip: x > 224 });
      b.prop("pk_pillar", 156, 262, { v: 3 }).prop("pk_pillar", 292, 262, { v: 3 });
      b.decal("pk_puddle", 300, 200, 26, 9, 5);
      b.start = { x: AW / 2, y: 210 };
      b.spawn(...EDGE, [24, 164], [AW - 24, 164], [224, 130]);
      break;
    }
    // 자동 세차장: 가운데 세로 세차 통로 (솔 넷), 젖은 바닥, 위 가로 통로
    case 5: {
      b.decal("pk_wet", 160, 120, 128, 160);
      for (const y of [168, 250]) b.prop("pk_brush", 192, y, { v: 0 }).prop("pk_brush", 256, y, { v: 1 });
      b.decal("pk_puddle", 120, 200, 36, 12, 6);
      b.decal("pk_puddle", 300, 150, 30, 10, 7);
      b.decal("pk_puddle", 330, 250, 26, 9, 8);
      b.prop("pk_car_side", 80, 170, { v: carV(121, false) }).prop("pk_car_side", 368, 230, { v: carV(122, false), flip: true });
      b.prop("pk_car", 60, 276, { v: carV(123, true) });
      b.prop("pk_cones", 130, 128).prop("pk_cones", 318, 128);
      b.start = { x: 120, y: 160 };
      b.spawn(...EDGE, [224, 272], [24, 160], [AW - 24, 160]);
      break;
    }
    // 하역장: 벽에 셔터, 팔레트·박스 더미, 카트 보관대, 아래 가로 통로
    case 6: {
      b.decal("pk_hatch", 40, TOP + 2, 368, 10);
      const pallets: [number, number][] = [
        [80, 96],
        [116, 100],
        [300, 92],
        [340, 104],
        [376, 96],
        [176, 160],
        [270, 166],
      ];
      pallets.forEach(([x, y], i) => b.prop("pk_pallet", x, y, { v: Math.floor(s(130 + i) * 4) }));
      b.prop("pk_corral", 224, 120);
      b.prop("pk_car_side", 90, 266, { v: carV(141, false) }).prop("pk_car_side", 360, 266, { v: carV(142, false), flip: true });
      b.prop("pk_pillar", 224, 266, { v: 3 });
      b.decal("pk_oil", 200, 240, 24, 8);
      b.start = { x: AW / 2, y: 150 };
      b.spawn(...EDGE, [24, 206], [AW - 24, 206], [224, 58]);
      break;
    }
    // 견인 차고지 (우두머리 층): 철망 울타리, 구석에 찌그러진 차 더미, 가운데는 넓게
    default: {
      b.decal("pk_tow_mark", 224 - 70, 159 - 18, 140, 36);
      for (const x of [60, 388]) b.prop("pk_fence", x, 62);
      b.prop("pk_fence", 140, AH - 30).prop("pk_fence", 308, AH - 30);
      b.prop("pk_wreck", 44, 80, { v: 0 }).prop("pk_wreck", AW - 44, 80, { v: 1 }).prop("pk_wreck", 44, 276, { v: 2 }).prop("pk_wreck", AW - 44, 276, { v: 3 });
      b.prop("pk_pillar", 140, 160, { v: 2 }).prop("pk_pillar", 308, 160, { v: 2 });
      b.decal("pk_oil", 120, 240, 26, 9);
      b.decal("pk_oil", 300, 70, 22, 8);
      b.decal("pk_puddle", 280, 250, 34, 12, 9);
      b.start = { x: AW / 2, y: 250 };
      b.spawn(...EDGE, [24, 160], [AW - 24, 160], [140, 44], [308, 44]);
      break;
    }
  }
  // 천장 형광등 빛 웅덩이는 실행부가 깜빡이며 그린다 (parkingStage)
  const free = (x: number, y: number) =>
    x >= SIDE + 12 && x <= AW - SIDE - 12 && y >= TOP + 12 && y <= AH - SIDE - 4 && solids.every((r) => Math.hypot(x - Math.max(r.x, Math.min(x, r.x + r.w)), y - Math.max(r.y, Math.min(y, r.y + r.h))) >= 12);
  const ok = cands.filter(([x, y]) => free(x, y));
  // 모자라면 가장자리를 돌며 채운다
  for (let k = 0; ok.length < 6 && k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const x = Math.round(AW / 2 + Math.cos(a) * (AW / 2 - 30));
    const y = Math.round((TOP + AH) / 2 + Math.sin(a) * ((AH - TOP) / 2 - 20));
    if (free(x, y) && ok.every(([px, py]) => Math.hypot(px - x, py - y) > 40)) ok.push([x, y]);
  }
  out.spawn(...ok);
}

// ── 바닥 ──

/** 방마다 콘크리트 색 (차고지는 아스팔트) */
const CONCRETE: [Color, Color][] = [
  [0x3e4044, 0x3a3c40],
  [0x3c3e44, 0x383a40],
  [0x403e3c, 0x3c3a38],
  [0x3a3c3e, 0x36383a],
  [0x3a4040, 0x363c3c],
  [0x34383e, 0x30343a],
  [0x403c38, 0x3c3834],
  [0x2e2e32, 0x2a2a2e],
];

export function parkingFloor(c: Ctx, l: L): void {
  const v = Math.max(0, Math.min(CONCRETE.length - 1, l.variant));
  const [a, b2] = CONCRETE[v];
  const T = 48;
  for (let y = 0; y < AH; y += T) for (let x = 0; x < AW; x += T) R(c, x, y, T, T, ((x + y) / T) % 2 ? a : b2);
  // 굵은 콘크리트 잡티·얼룩
  for (let k = 0; k < 1400; k++) {
    const x = Math.floor(hash2(k, 1, 4410 + v) * AW);
    const y = Math.floor(hash2(k, 2, 4410 + v) * AH);
    R(c, x, y, 1, 1, hash2(k, 3, 4410) < 0.5 ? lighten(a, 0.08) : darken(a, 0.12));
  }
  for (let k = 0; k < 9; k++) E(c, hash2(k, 4, 4420 + v) * AW, TOP + hash2(k, 5, 4420 + v) * (AH - TOP), 10 + hash2(k, 6, 4420) * 16, 5 + hash2(k, 7, 4420) * 6, darken(a, 0.1), 0.6);
  // 슬래브 줄눈
  for (let y = 0; y < AH; y += T) R(c, 0, y, AW, 1, darken(a, 0.28));
  for (let x = 0; x < AW; x += T) R(c, x, 0, 1, AH, darken(a, 0.28));
  // 금 (구불구불 짧은 선)
  for (let k = 0; k < 6; k++) {
    let x = hash2(k, 8, 4430 + v) * AW;
    let y = TOP + hash2(k, 9, 4430 + v) * (AH - TOP);
    for (let i = 0; i < 26; i++) {
      R(c, x, y, 1, 1, darken(a, 0.35));
      x += hash2(k, i, 4431) < 0.5 ? 1 : 0;
      y += hash2(k, i, 4432) < 0.6 ? 1 : 0;
      x -= hash2(k, i, 4433) < 0.2 ? 1 : 0;
    }
  }
  // 타이어 자국 (긴 호 두 줄)
  for (let k = 0; k < 3; k++) {
    const cx = hash2(k, 10, 4440 + v) * AW;
    const cy = TOP + 40 + hash2(k, 11, 4440 + v) * (AH - TOP - 60);
    const r = 60 + hash2(k, 12, 4440) * 70;
    const a0 = hash2(k, 13, 4440 + v) * Math.PI * 2;
    for (let t = 0; t < 1.1; t += 0.008) {
      const ang = a0 + t;
      R(c, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.5, 2, 1, 0x1a1a1e, 0.35);
      R(c, cx + Math.cos(ang) * (r + 9), cy + Math.sin(ang) * (r + 9) * 0.5, 2, 1, 0x1a1a1e, 0.3);
    }
  }
  for (const d of l.decals) decal(c, d);
}

function decal(c: Ctx, d: Decal): void {
  switch (d.kind) {
    case "pk_lane": {
      // 통로: 조금 어두운 아스팔트 + 노란 점선 + 흰 화살표
      R(c, d.x, d.y, d.w, d.h, 0x2c2e32, 0.75);
      const hor = d.v !== 1;
      if (hor) {
        R(c, d.x, d.y, d.w, 1, 0xd8d8d0, 0.55);
        R(c, d.x, d.y + d.h - 1, d.w, 1, 0xd8d8d0, 0.55);
        for (let x = d.x + 6; x < d.x + d.w - 8; x += 22) R(c, x, d.y + d.h / 2 - 1, 12, 2, 0xe8c030, 0.9);
        for (let x = d.x + 40; x < d.x + d.w - 30; x += 120) arrow(c, x, d.y + 7, true);
      } else {
        R(c, d.x, d.y, 1, d.h, 0xd8d8d0, 0.55);
        R(c, d.x + d.w - 1, d.y, 1, d.h, 0xd8d8d0, 0.55);
        for (let y = d.y + 6; y < d.y + d.h - 8; y += 22) R(c, d.x + d.w / 2 - 1, y, 2, 12, 0xe8c030, 0.9);
        for (let y = d.y + 30; y < d.y + d.h - 30; y += 100) arrow(c, d.x + 6, y, false);
      }
      break;
    }
    case "pk_bays": {
      // 주차 칸: 흰 칸선 (앞쪽은 열려 있다), 칸 안 번호 자국
      const front = (d.v ?? 0) % 2 === 1;
      const bw = Math.floor((d.v ?? 0) / 2) || 34;
      const n = Math.round(d.w / bw);
      for (let i = 0; i <= n; i++) R(c, d.x + i * bw, d.y, 2, d.h, 0xe8e8e0, 0.8);
      R(c, d.x, front ? d.y + d.h - 2 : d.y, d.w + 2, 2, 0xe8e8e0, 0.8);
      for (let i = 0; i < n; i++) {
        const t = `${((i * 7 + d.x) % 89) + 10}`;
        pkText(c, t, d.x + 10 + i * bw, front ? d.y + d.h - 10 : d.y + 4, 0xe8e8e0, 1, 0.35);
        // 바퀴 멈춤턱
        R(c, d.x + 9 + i * bw, front ? d.y + d.h - 6 : d.y + 6, 16, 2, 0xd8c040, 0.5);
      }
      break;
    }
    case "pk_puddle": {
      // 웅덩이: 짙은 물 + 테두리 반사 (기름 무지개는 게임이 움직인다)
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      E(c, cx, cy, d.w / 2 + 2, d.h / 2 + 1, 0x24282e, 0.55);
      E(c, cx, cy, d.w / 2, d.h / 2, 0x1c2430, 0.9);
      E(c, cx - d.w * 0.15, cy - d.h * 0.15, d.w * 0.28, d.h * 0.2, 0x3a4a5e, 0.7);
      R(c, cx - d.w * 0.3, cy - 1, d.w * 0.18, 1, 0x8aa0b8, 0.6);
      break;
    }
    case "pk_oil": {
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      E(c, cx, cy, d.w / 2, d.h / 2, 0x141418, 0.55);
      E(c, cx + 2, cy, d.w / 3, d.h / 3, 0x0e0e12, 0.6);
      const cols = [0x6a3a8a, 0x2a7a8a, 0x8a8a2a];
      for (let i = 0; i < 3; i++) R(c, cx - d.w / 3 + i * 4, cy - 2 + i, 4, 1, cols[i], 0.45);
      break;
    }
    case "pk_ramp": {
      // 경사로: 위로 갈수록 밝아지는 띠 + 셰브런 + 양옆 노랑·검정 연석
      for (let y = d.y; y < d.y + d.h; y++) R(c, d.x, y, d.w, 1, 0x34363a, 0.5 + 0.3 * (1 - (y - d.y) / d.h));
      for (let y = d.y + 20; y < d.y + d.h - 10; y += 26)
        for (let i = 0; i < 12; i++) {
          R(c, d.x + d.w / 2 - 1 - i * 2, y + i, 3, 2, 0xe8e8e0, 0.55);
          R(c, d.x + d.w / 2 - 1 + i * 2, y + i, 3, 2, 0xe8e8e0, 0.55);
        }
      for (let y = d.y; y < d.y + d.h; y += 6) {
        R(c, d.x, y, 4, 3, 0xe8c030);
        R(c, d.x, y + 3, 4, 3, 0x1a1a1e);
        R(c, d.x + d.w - 4, y, 4, 3, 0xe8c030);
        R(c, d.x + d.w - 4, y + 3, 4, 3, 0x1a1a1e);
      }
      break;
    }
    case "pk_hatch":
      for (let x = 0; x < d.w; x++) for (let y = 0; y < d.h; y++) if (((x + y) >> 2) % 2) R(c, d.x + x, d.y + y, 1, 1, 0xe8c030, 0.75);
      break;
    case "pk_island":
      R(c, d.x, d.y, d.w, d.h, 0x4a4c50);
      R(c, d.x, d.y, d.w, 2, 0x6a6c70);
      for (let x = d.x; x < d.x + d.w; x += 8) {
        R(c, x, d.y + d.h - 3, 4, 3, 0xe8c030);
        R(c, x + 4, d.y + d.h - 3, 4, 3, 0x1a1a1e);
      }
      break;
    case "pk_cross":
      for (let y = d.y; y < d.y + d.h; y += 8) R(c, d.x, y, d.w, 4, 0xe8e8e0, 0.7);
      break;
    case "pk_ev": {
      R(c, d.x, d.y, d.w, d.h, 0x2a8a5a, 0.35);
      for (let x = d.x; x < d.x + d.w; x += 62) {
        R(c, x, d.y, 2, d.h, 0xe8e8e0, 0.8);
        // 플러그 그림
        R(c, x + 26, d.y + 30, 8, 10, 0xe8e8e0, 0.6);
        R(c, x + 27, d.y + 26, 2, 4, 0xe8e8e0, 0.6);
        R(c, x + 31, d.y + 26, 2, 4, 0xe8e8e0, 0.6);
        R(c, x + 29, d.y + 40, 2, 5, 0xe8e8e0, 0.6);
      }
      R(c, d.x + d.w, d.y, 2, d.h, 0xe8e8e0, 0.8);
      break;
    }
    case "pk_wet":
      for (let k = 0; k < 220; k++) {
        const x = d.x + hash2(k, 1, 4450) * d.w;
        const y = d.y + hash2(k, 2, 4450) * d.h;
        R(c, x, y, 2 + Math.floor(hash2(k, 3, 4450) * 4), 1, 0x6a88a8, 0.3);
      }
      R(c, d.x, d.y, d.w, d.h, 0x2a4a6a, 0.18);
      break;
    case "pk_tow_mark": {
      // 견인 지역 표시: 붉은 사선 칸 + 가운데 갈고리 그림
      R(c, d.x, d.y, d.w, d.h, 0x8a1a1a, 0.25);
      for (let x = 0; x < d.w; x++) for (let y = 0; y < d.h; y++) if (((x + y) >> 3) % 2 === 0 && (x < 4 || y < 4 || x > d.w - 5 || y > d.h - 5)) R(c, d.x + x, d.y + y, 1, 1, 0xd8302a, 0.8);
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      R(c, cx - 1, cy - 12, 3, 14, 0xe8e8e0, 0.7);
      for (let a = 0; a < Math.PI; a += 0.1) R(c, cx + 5 + Math.cos(a + Math.PI / 2) * -6, cy + 2 + Math.sin(a) * 6, 2, 2, 0xe8e8e0, 0.7);
      break;
    }
  }
}

/** 바닥 화살표 (오른쪽·아래쪽) */
function arrow(c: Ctx, x: number, y: number, hor: boolean): void {
  if (hor) {
    R(c, x, y + 8, 18, 3, 0xe8e8e0, 0.6);
    for (let i = 0; i < 7; i++) R(c, x + 16 + i, y + 3 + i, 2, 13 - i * 2, 0xe8e8e0, 0.6);
  } else {
    R(c, x + 8, y, 3, 18, 0xe8e8e0, 0.6);
    for (let i = 0; i < 7; i++) R(c, x + 3 + i, y + 16 + i, 13 - i * 2, 2, 0xe8e8e0, 0.6);
  }
}

// ── 벽 ──

/** 방마다 벽 띠 색 (층 구역 색) */
const BAND: Color[] = [0x2a62c8, 0x2a9a5a, 0xd8a020, 0x8a4ac8, 0x2ab08a, 0x2a8ad8, 0xd86a2a, 0xc83030];

export function parkingWall(c: Ctx, l: L): void {
  const v = Math.max(0, Math.min(BAND.length - 1, l.variant));
  const band = BAND[v];
  R(c, 0, 0, AW, TOP, 0x4a4c50);
  for (let k = 0; k < 400; k++) R(c, hash2(k, 3, 4460) * AW, hash2(k, 4, 4460) * TOP, 1, 1, hash2(k, 5, 4460) < 0.5 ? 0x56585c : 0x404246);
  // 천장 배관 (회색 덕트 + 빨간 스프링클러 관)
  R(c, 0, 0, AW, 4, 0x3a3c40);
  R(c, 0, 1, AW, 2, 0x6a6c70);
  R(c, 0, 5, AW, 2, 0xa83030);
  for (let x = 30; x < AW; x += 90) {
    R(c, x, 4, 3, 5, 0x8a8c90);
    R(c, x - 1, 8, 5, 1, 0xc8c8c0);
  }
  // 구역 색 띠 + 큰 층 글자 (B2·B3)
  R(c, 0, 12, AW, 9, band);
  R(c, 0, 12, AW, 1, lighten(band, 0.25));
  R(c, 0, 20, AW, 1, darken(band, 0.3));
  const lvl = v % 2 ? "B3" : "B2";
  for (const x of [118, 300]) pkText(c, lvl, x, 13, 0xf2f2ee, 1.4);
  // 파란 P 표지
  const pSign = (x: number) => {
    R(c, x, 3, 13, 13, 0xf2f2ee);
    R(c, x + 1, 4, 11, 11, 0x2a5ad8);
    pkText(c, "P", x + 3, 6, 0xf2f2ee, 2 / 1.2);
  };
  switch (v) {
    case 1: {
      // 경사로: 벽이 뚫린 출구 (바깥 빛) + 위쪽 화살표
      R(c, 184, 0, 80, TOP, 0x1a1c20);
      for (let y = 0; y < TOP - 2; y++) R(c, 186, y, 76, 1, 0x8aa8c8, 0.25 + (1 - y / TOP) * 0.55);
      R(c, 184, 0, 4, TOP, 0xe8c030);
      R(c, 260, 0, 4, TOP, 0xe8c030);
      for (let i = 0; i < 6; i++) R(c, 224 - i, 6 + i, 1 + i * 2, 1, 0xf2f2ee);
      R(c, 222, 12, 4, 10, 0xf2f2ee);
      pSign(330);
      break;
    }
    case 2:
      // 정산소: 요금표 판 (칸 + 숫자)
      R(c, 330, 3, 60, 18, 0x1a1c24);
      R(c, 331, 4, 58, 3, 0xd8a020);
      for (let j = 0; j < 3; j++) {
        R(c, 334, 9 + j * 4, 20, 2, 0xc8c8c0, 0.7);
        pkText(c, `${(j + 1) * 1000}`.slice(0, 4), 360, 8 + j * 4, 0xffd04a, 0.8);
      }
      pSign(180);
      break;
    case 4:
      // 충전 구역: 번개 표지 + 초록 띠 위 플러그
      for (const x of [170, 260]) {
        R(c, x, 2, 14, 16, 0x1a4a2a);
        for (let j = 0; j < 12; j++) R(c, x + 8 - Math.floor(j / 2) + (j > 6 ? 3 : 0), 4 + j, 3, 1, 0x7aff9a);
      }
      break;
    case 5:
      // 세차장: 세차 통로 입구 (색색 솔이 보인다) + 물 분사 노즐
      R(c, 176, 0, 96, TOP, 0x1c2a3a);
      for (let x = 180; x < 268; x += 6) R(c, x, 2, 4, TOP - 6, [0x2a6ad8, 0xd83a6a, 0xe8c030, 0x3ab06a][(x / 6) % 4], 0.8);
      R(c, 176, 0, 96, 3, 0xc8c8d0);
      pSign(330);
      break;
    case 6:
      // 하역장: 셔터 셋 (골판 + 노랑·검정 아랫단)
      for (const x of [40, 170, 300]) {
        R(c, x, 0, 108, TOP - 2, 0x6a6e74);
        for (let y = 1; y < TOP - 6; y += 3) R(c, x, y, 108, 1, 0x50545a);
        for (let i = 0; i < 108; i += 6) {
          R(c, x + i, TOP - 6, 3, 4, 0xe8c030);
          R(c, x + i + 3, TOP - 6, 3, 4, 0x1a1a1e);
        }
        R(c, x + 50, 10, 8, 3, 0x2a2c30);
      }
      break;
    case 7: {
      // 견인 차고지: 철망 + 투광등 + 붉은 견인 표지
      R(c, 0, 0, AW, TOP, 0x2a2c30);
      for (let y = 0; y < TOP; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < AW; x += 4) R(c, x, y, 1, 1, 0x7a7e86, 0.6);
      for (const x of [90, 358]) {
        R(c, x, 2, 18, 8, 0x3a3c40);
        R(c, x + 2, 4, 14, 4, 0xfff0c0);
      }
      for (let j = 0; j < 16; j++) R(c, 224 - j / 1.2, 4 + j, j * 1.6 + 1, 1, 0xd8302a);
      R(c, 222, 9, 3, 6, 0xf2f2ee);
      R(c, 222, 16, 3, 2, 0xf2f2ee);
      return;
    }
    default:
      pSign(190);
      pSign(240);
  }
  // 비상구 표시등 상자 (빛은 게임이)
  for (const p of pkExitSigns(v)) {
    R(c, p.x - 9, p.y - 5, 18, 10, 0x0e3a1e);
    R(c, p.x - 8, p.y - 4, 16, 8, 0x1aa04a);
    R(c, p.x - 6, p.y - 3, 4, 6, 0xe8ffe8);
    R(c, p.x - 1, p.y - 3, 2, 2, 0xe8ffe8);
    R(c, p.x - 1, p.y - 1, 3, 1, 0xe8ffe8);
    R(c, p.x + 1, p.y, 1, 3, 0xe8ffe8);
    R(c, p.x + 3, p.y - 2, 3, 3, 0xe8ffe8);
  }
  // 소화전함
  R(c, 410, 4, 12, 16, 0xb02a2a);
  R(c, 411, 5, 10, 6, 0xd84a4a);
  R(c, 0, TOP - 3, AW, 3, 0x2a2c30);
  R(c, 0, TOP - 3, AW, 1, 0x6a6c70);
}

export const PK_SIDE: Color = 0x26282c;

// ── 소품 그림 (art.ts PROPS에 펼쳐 넣는다) ──

type PropPaint = (c: Ctx, w: number, h: number, v: number) => void;

/** 차 색 여덟 가지 (v >> 1) */
const CAR_COLORS: Color[] = [0xc83030, 0xe8e8e4, 0x26282e, 0x9aa0a8, 0x2a5ac0, 0xe8c030, 0x3a7a4a, 0x8a4a2a];
const carColor = (v: number) => CAR_COLORS[(v >> 1) % CAR_COLORS.length];

/** 차의 비상등 자리 (소품 바닥 가운데 기준) — 게임이 깜빡인다 */
export function pkCarLights(kind: string, v: number, flip: boolean): Pt[] {
  if (kind === "pk_car") return [{ x: -9, y: -7 }, { x: 9, y: -7 }];
  if (kind === "pk_car_side") return flip ? [{ x: 24, y: -14 }, { x: -24, y: -14 }] : [{ x: -24, y: -14 }, { x: 24, y: -14 }];
  void v;
  return [];
}

export const PK_PROPS: Record<string, PropPaint> = {
  // 주차 칸에 세로로 선 차 (위에서 비스듬히 본): 보닛 → 앞유리 → 지붕 → 뒷유리 → 트렁크, 맨 아래는 앞(전조등·그릴) 또는 뒤(미등·번호판)
  pk_car(c, w, h, v) {
    const col = carColor(v);
    const front = v % 2 === 1;
    const dk = darken(col, 0.32);
    const lt = lighten(col, 0.28);
    const glass = 0x1e2a36;
    E(c, w / 2, h - 3, w / 2, 3, 0x000000, 0.4);
    // 바퀴 (옆으로 살짝 보인다)
    for (const y of [8, 29]) {
      R(c, 1, y, 3, 6, 0x101014);
      R(c, w - 4, y, 3, 6, 0x101014);
    }
    // 몸통 (모서리를 깎은 긴 몸)
    R(c, 4, 2, w - 8, 1, col);
    R(c, 3, 3, w - 6, 1, col);
    R(c, 2, 4, w - 4, 34, col);
    R(c, 3, 38, w - 6, 1, col);
    R(c, 2, 4, 1, 34, lt);
    R(c, w - 3, 4, 1, 34, dk);
    R(c, 4, 2, w - 8, 1, lt);
    // 보닛·트렁크 가운데 접힌 선
    const capY = front ? 30 : 4;
    R(c, w / 2 - 1, capY, 2, 7, lighten(col, 0.12));
    // 유리: 앞유리는 크게, 뒷유리는 작게 (사다리꼴)
    const shield = (y: number, n: number, up: boolean) => {
      for (let k = 0; k < n; k++) R(c, 5 + (up ? n - 1 - k : k), y + k, w - 10 - (up ? n - 1 - k : k) * 2, 1, glass);
      R(c, 7, y + (up ? n - 1 : 0), 4, 1, 0x7a9ab8);
    };
    if (front) {
      shield(5, 3, false);
      R(c, 4, 8, w - 8, 14, darken(col, 0.1));
      R(c, 5, 9, w - 10, 1, lighten(col, 0.08));
      shield(22, 5, true);
    } else {
      shield(11, 5, false);
      R(c, 4, 16, w - 8, 13, darken(col, 0.1));
      R(c, 5, 17, w - 10, 1, lighten(col, 0.08));
      shield(29, 3, true);
    }
    // 사이드미러
    R(c, 0, front ? 22 : 12, 2, 2, dk);
    R(c, w - 2, front ? 22 : 12, 2, 2, dk);
    // 앞·뒤 면
    const y = 37;
    R(c, 2, y, w - 4, 6, dk);
    R(c, 2, y, w - 4, 1, darken(col, 0.15));
    if (front) {
      R(c, 3, y + 1, 6, 3, 0xfff4c8);
      R(c, w - 9, y + 1, 6, 3, 0xfff4c8);
      R(c, 4, y + 1, 2, 1, 0xffffff);
      for (let x = 10; x < w - 10; x += 2) R(c, x, y + 2, 1, 2, 0x141418);
      R(c, 10, y + 1, w - 20, 1, 0x8a8c90);
      R(c, w / 2 - 4, y + 4, 8, 2, 0xf2f2ee);
    } else {
      R(c, 3, y + 1, 6, 2, 0xd82a2a);
      R(c, w - 9, y + 1, 6, 2, 0xd82a2a);
      R(c, 4, y + 1, 2, 1, 0xff8a7a);
      R(c, w / 2 - 5, y + 2, 10, 3, 0xf2f2ee);
      R(c, w / 2 - 4, y + 3, 8, 1, 0x2a2a30);
    }
    R(c, 2, h - 3, w - 4, 1, 0x101014);
    // 딱지 (가끔 와이퍼에 끼워져 있다)
    if ((v * 7) % 5 === 0) R(c, w / 2 + 2, front ? 23 : 12, 5, 3, 0xf4dc4a);
  },
  // 옆으로 선 차: 바퀴 둘, 창문 둘, 앞(오른쪽) 전조등
  pk_car_side(c, w, h, v) {
    const col = carColor(v);
    const dk = darken(col, 0.3);
    E(c, w / 2, h - 3, w / 2 - 2, 3, 0x000000, 0.35);
    R(c, 3, 10, w - 6, 11, col);
    R(c, 1, 13, w - 2, 7, col);
    R(c, 12, 3, w - 26, 8, col);
    R(c, 12, 3, w - 26, 1, lighten(col, 0.25));
    R(c, 14, 4, 11, 6, 0x2a3a4a);
    R(c, 27, 4, 11, 6, 0x2a3a4a);
    R(c, 15, 4, 3, 1, 0x8aa8c8);
    R(c, 28, 4, 3, 1, 0x8aa8c8);
    R(c, 3, 10, w - 6, 1, lighten(col, 0.2));
    R(c, 3, 19, w - 6, 2, dk);
    R(c, 26, 12, 1, 7, dk);
    R(c, 20, 14, 3, 1, 0x8a8c90);
    R(c, 32, 14, 3, 1, 0x8a8c90);
    R(c, w - 4, 13, 3, 3, 0xfff4c8);
    R(c, 1, 13, 2, 3, 0xd82a2a);
    for (const x of [12, w - 13]) {
      E(c, x, h - 6, 5, 5, 0x141418);
      E(c, x, h - 6, 2, 2, 0x9aa0a8);
    }
  },
  // 콘크리트 기둥: 아래 노랑·검정 보호대, 가운데 구역 색 띠(층 글자는 게임이 쓴다), 모서리 닳음
  pk_pillar(c, w, h, v) {
    R(c, 1, 0, w - 2, h - 2, 0x8a8c90);
    R(c, 1, 0, w - 2, 2, 0xb0b2b6);
    R(c, w - 4, 2, 3, h - 4, 0x6a6c70);
    R(c, 1, 2, 1, h - 4, 0xa0a2a6);
    for (let k = 0; k < 30; k++) R(c, 2 + hash2(k, v, 4470) * (w - 5), 2 + hash2(k, 1, 4470) * (h - 6), 1, 1, 0x6a6c70);
    const band = v === 3 ? 0x2a9a5a : 0x2a62c8;
    R(c, 1, 12, w - 2, 12, band);
    R(c, 1, 12, w - 2, 1, lighten(band, 0.25));
    pkText(c, v === 3 ? "B3" : "B2", 3, 15, 0xf2f2ee);
    for (let y = h - 12; y < h - 2; y += 4) {
      R(c, 1, y, w - 2, 2, 0xe8c030);
      R(c, 1, y + 2, w - 2, 2, 0x1a1a1e);
    }
    R(c, 0, h - 2, w, 2, 0x2a2c30);
  },
  // 정산소: 작은 유리 부스 + 지붕 + 노란 등
  pk_booth(c, w, h) {
    R(c, 1, 6, w - 2, h - 8, 0xd8d8d0);
    R(c, 0, 4, w, 4, 0xd8a020);
    R(c, 0, 4, w, 1, 0xf0c040);
    R(c, 4, 10, w - 8, 14, 0x3a5a7a);
    R(c, 5, 11, 6, 1, 0xa8c8e8);
    R(c, 6, 14, 1, 8, 0xa8c8e8, 0.4);
    R(c, w / 2 - 4, 26, 8, 6, 0x2a2c30);
    R(c, w / 2 - 3, 27, 6, 2, 0x3aff9a);
    R(c, 3, h - 10, w - 6, 6, 0xa8a8a0);
    R(c, w / 2 - 2, 0, 4, 4, 0xffd04a);
    R(c, 0, h - 2, w, 2, 0x2a2c30);
  },
  // 차단기 기둥 (봉은 올라가 있다)
  pk_gate(c, w, h) {
    R(c, 2, h - 14, 8, 12, 0xe8e4dc);
    R(c, 2, h - 14, 8, 1, 0xffffff);
    R(c, 4, h - 11, 4, 3, 0x2a2c30);
    R(c, 5, h - 10, 2, 1, 0xd8302a);
    for (let y = 0; y < h - 14; y += 4) R(c, 5, y, 2, 2, y % 8 ? 0xd8302a : 0xf2f2ee);
    R(c, 1, h - 2, w - 2, 2, 0x2a2c30);
  },
  // 전기차 충전기: 흰 기둥 + 초록 화면 + 감긴 케이블
  pk_charger(c, w, h) {
    R(c, 2, 2, w - 4, h - 4, 0xe8ecec);
    R(c, 2, 2, w - 4, 1, 0xffffff);
    R(c, w - 4, 3, 2, h - 6, 0xb0b4b4);
    R(c, 4, 5, w - 8, 6, 0x0a2a1a);
    R(c, 5, 6, w - 10, 2, 0x3aff9a);
    for (let k = 0; k < 6; k++) R(c, 3 + Math.round(Math.sin(k) * 2), 14 + k * 2, 3, 1, 0x2a2c30);
    R(c, 1, h - 3, w - 2, 2, 0x2a6a4a);
  },
  // 세차 솔: 색색 털이 붙은 둥근 기둥
  pk_brush(c, w, h, v) {
    R(c, w / 2 - 1, 0, 2, 4, 0x8a8c90);
    const cols = v ? [0x2a6ad8, 0x6aa0ff] : [0xd83a6a, 0xff8ab0];
    for (let y = 4; y < h - 4; y++) {
      const half = w / 2 - 1 - (y < 7 ? 7 - y : 0);
      for (let x = -half; x <= half; x++) R(c, w / 2 + x, y, 1, 1, (x + y * 3) % 5 === 0 ? cols[1] : cols[0]);
    }
    R(c, 2, h - 6, w - 4, 2, 0x000000, 0.3);
    R(c, 3, h - 4, w - 6, 2, 0x3a3c40);
  },
  // 팔레트 + 박스 (v마다 쌓인 모양)
  pk_pallet(c, w, h, v) {
    R(c, 0, h - 6, w, 4, 0xa87a4a);
    for (let x = 1; x < w; x += 7) R(c, x, h - 6, 3, 4, 0x8a5a2a);
    R(c, 0, h - 2, w, 2, 0x5a3a1a);
    const n = 1 + (v % 3);
    for (let k = 0; k < n; k++) {
      const bw = w - 6 - k * 4;
      const y = h - 6 - (k + 1) * 7;
      R(c, 3 + k * 2, y, bw, 7, k % 2 ? 0xc89a5a : 0xb88a4a);
      R(c, 3 + k * 2, y, bw, 1, 0xd8b070);
      R(c, 3 + k * 2 + bw / 2 - 1, y, 2, 7, 0xa87a3a);
    }
    if (v === 3) R(c, 4, h - 6 - n * 7 - 3, 8, 3, 0x3a7ad8);
  },
  // 카트 보관대: 줄지어 꽂힌 카트
  pk_corral(c, w, h) {
    R(c, 0, h - 4, w, 2, 0xe8c030);
    for (let k = 0; k < 5; k++) {
      const x = 2 + k * 7;
      R(c, x, 4, 10, 9, 0x9aa4b0);
      for (let y = 5; y < 12; y += 2) R(c, x + 1, y, 8, 1, 0x6a7480);
      R(c, x + 9, 2, 1, 3, 0xd8302a);
      R(c, x + 1, 13, 2, 2, 0x1a1a1e);
      R(c, x + 7, 13, 2, 2, 0x1a1a1e);
    }
    R(c, 0, 2, 2, h - 4, 0x6a6c70);
    R(c, w - 2, 2, 2, h - 4, 0x6a6c70);
  },
  pk_bollard(c, w, h) {
    R(c, 1, 1, w - 2, h - 3, 0xe8c030);
    R(c, 1, 4, w - 2, 2, 0x1a1a1e);
    R(c, 1, 8, w - 2, 2, 0x1a1a1e);
    R(c, 0, h - 2, w, 2, 0x2a2c30);
  },
  // 라바콘 두셋
  pk_cones(c) {
    for (const [x, y] of [
      [4, 13],
      [11, 11],
      [14, 13],
    ]) {
      R(c, x - 3, y - 1, 7, 2, 0x2a2c30);
      for (let j = 0; j < 8; j++) R(c, x - Math.floor(j / 3), y - 2 - (7 - j), 1 + Math.floor(j / 3) * 2, 1, j === 3 || j === 4 ? 0xf2f2ee : 0xff6a1a);
    }
  },
  // 견인돼 찌그러진 차 (색·모양 넷)
  pk_wreck(c, w, h, v) {
    const col = CAR_COLORS[(v * 3 + 1) % CAR_COLORS.length];
    E(c, w / 2, h - 3, w / 2, 3, 0x000000, 0.35);
    R(c, 3, 12, w - 6, 14, darken(col, 0.15));
    for (let x = 3; x < w - 3; x++) R(c, x, 10 + Math.round(Math.sin(x / 3 + v) * 2), 1, 3, col);
    R(c, 10, 6, w - 22, 6, darken(col, 0.3));
    R(c, 12, 7, 8, 4, 0x1a2430);
    R(c, 23, 7, 9, 4, 0x2a3a4a);
    for (let k = 0; k < 6; k++) R(c, 6 + k * 6, 14 + (k % 2) * 4, 3, 1, 0x1a1a1e, 0.6);
    for (let k = 0; k < 10; k++) R(c, 4 + hash2(k, v, 4480) * (w - 8), 12 + hash2(k, 1, 4480) * 12, 2, 1, 0x8a4a2a, 0.7);
    for (const x of [10, w - 11]) E(c, x, h - 6, 5, 4, 0x141418);
    if (v % 2) R(c, w - 6, 4, 4, 8, 0x8a8c90);
  },
  // 철망 울타리
  pk_fence(c, w, h) {
    for (const x of [0, w - 2]) R(c, x, 0, 2, h, 0x6a6e76);
    R(c, 0, 0, w, 2, 0x8a8e96);
    for (let y = 2; y < h - 4; y += 3) for (let x = (y / 3) % 2 ? 1 : 3; x < w - 2; x += 4) R(c, x, y, 1, 1, 0x9aa0a8, 0.8);
    R(c, 0, h - 4, w, 2, 0x5a5e66);
  },
  pk_extinguisher(c, w, h) {
    R(c, 1, 1, w - 2, h - 3, 0xb02a2a);
    R(c, 2, 2, w - 4, 5, 0xe8e8e0);
    R(c, 3, 9, w - 6, 6, 0xd84a4a);
    R(c, 0, h - 2, w, 2, 0x2a2c30);
  },
};
