import { SEA_DECKS, SEA_FURNITURE, SEA_GHOST_BERTH, SEA_MATS, SEA_SCOPES, SEA_SPOTS, SEA_FLAT_Y0 } from "@tomb/protocol";
import { Grid, hash2, mix, vnoise, type Color } from "../sprites/pixel";
import type { Bulb } from "../sprites/winterArt";
import { pathEdgeDist, seaFurnitureColliders, seaGroundKind, seaStandable, seaStaticColliders, SEA_DECOR, SEA_INTERACTABLES, SEA_LAMPS, SEA_TREES, type Rect } from "./seaLayout";
import { SEA_ICE, SEA_SNOW, seaSnowLineY } from "./seaWinterGround";

// 11/17 달물결 포구 겨울·크리스마스 그림 조각 (순수 — Phaser·캔버스 없이 RGBA 배열과 Grid로). SeaConceptDecor가 텍스처에 얹어요.
//  - snowDeck: 위에서 본 판자·콘크리트 데크에 눈 (난간·가장자리 쪽은 소복이, 가운데는 밟혀 군데군데) + 앞 테 고드름
//  - iceBandArt: 물가 살얼음 띠 (가로로 이어 붙는 얇은 얼음 조각들 — SeaMap이 물때 물가 선을 따라 그려요)
//  - stringLights: 두 점 사이 전구 줄 (가로면 아래로, 세로면 옆으로 늘어져요)
//  - 등대 나선 전구 · 배 장식 줄 자리 · 가로등 리본 · 크리스마스 눈사람·선물 자리

/** 캔버스 픽셀 (getImageData 그대로) */
export type Img = { w: number; h: number; d: Uint8ClampedArray };
export type Pt = { x: number; y: number };

const alphaAt = (m: Img, x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.d[(y * m.w + x) * 4 + 3]);
const rgbAt = (m: Img, x: number, y: number): Color => {
  const i = (y * m.w + x) * 4;
  return (m.d[i] << 16) | (m.d[i + 1] << 8) | m.d[i + 2];
};
export function putPx(m: Img, x: number, y: number, c: Color, a = 255): void {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  const i = (y * m.w + x) * 4;
  m.d[i] = (c >> 16) & 255;
  m.d[i + 1] = (c >> 8) & 255;
  m.d[i + 2] = c & 255;
  m.d[i + 3] = a;
}
const lum = (c: Color) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

/**
 * 위에서 본 데크에 눈 (판자·콘크리트 공용). lip = 그림 맨 아래 앞 테 줄 수 (그 줄은 데크 앞면 — 위 한 줄은 눈 처마, 그 아래는 고드름).
 * 눈 양 = 큰 얼룩 잡음 + 가장자리(투명한 곳·그림 끝)에 가까울수록 더 (난간 쪽에 쌓여요). 덜 쌓인 곳은 판자 위 서리만
 */
export function snowDeck(m: Img, lip = 0, seed = 1, area?: { x0: number; y0: number; x1: number; y1: number }): void {
  const W = m.w;
  const H = m.h;
  const top = H - lip;
  const solid = (x: number, y: number) => alphaAt(m, x, y) >= 200;
  // 가로 가장자리까지 거리 (6px까지만 봐요)
  const edgeDist = (x: number, y: number) => {
    for (let k = 0; k < 6; k++) if (!solid(x - k - 1, y) || !solid(x + k + 1, y) || x - k - 1 < 0 || x + k + 1 >= W) return k;
    return 6;
  };
  // area를 주면 그 사각형만 (별장 터 안 바다 쪽 데크처럼 그림 일부만 데크일 때)
  const ys = area ? Math.max(0, area.y0) : 0;
  const ye = area ? Math.min(top - 1, area.y1) : top - 1;
  const xs = area ? Math.max(0, area.x0) : 0;
  const xe = area ? Math.min(W - 1, area.x1) : W - 1;
  // 눈 양 (먼저 다 재고 그려요 — 눈 더미 아래 테에 그늘을 넣으려고)
  const amt = new Float32Array(W * H).fill(Number.NaN);
  for (let y = ys; y <= ye; y++)
    for (let x = xs; x <= xe; x++) {
      if (!solid(x, y)) continue;
      const n = vnoise(x + seed * 37, y, 7, 421) * 0.6 + vnoise(x, y + seed * 53, 19, 423) * 0.4;
      const e = Math.max(0, 1 - edgeDist(x, y) / 5) * 0.55;
      amt[y * W + x] = n + e - 0.6;
    }
  const snowAt = (x: number, y: number) => x >= xs && x <= xe && y >= ys && y <= ye && amt[y * W + x] > 0.07;
  for (let y = ys; y <= ye; y++)
    for (let x = xs; x <= xe; x++) {
      const s = amt[y * W + x];
      if (Number.isNaN(s)) continue;
      const c = rgbAt(m, x, y);
      if (s > 0.07) {
        // 더미 윗테는 밝게, 아랫테는 푸른 그늘 (두께가 보여요). 판자 이음(어두운 줄)은 눈 위에도 옅은 줄로
        if (y < ye && !snowAt(x, y + 1) && solid(x, y + 1)) putPx(m, x, y, SEA_SNOW.shade);
        else if (y > ys && !snowAt(x, y - 1)) putPx(m, x, y, SEA_SNOW.hi);
        else putPx(m, x, y, lum(c) < 150 ? SEA_SNOW.lo : s > 0.2 && hash2(x, y, seed + 431) < 0.25 ? SEA_SNOW.hi : SEA_SNOW.mid);
      } else if (y > ys && snowAt(x, y - 1)) putPx(m, x, y, mix(c, 0x6a7a90, 0.3)); // 더미가 드리운 그늘
      else if (s > 0) putPx(m, x, y, mix(c, SEA_SNOW.lo, 0.55));
      else putPx(m, x, y, mix(c, 0xdfe7ef, 0.16));
    }
  if (lip <= 0) return;
  // 앞 테: 맨 위 줄은 눈 처마, 그 아래는 고드름 (2px마다, 길이 들쭉날쭉) — 고드름이 없는 칸은 원래 앞면을 차갑게
  for (let x = 0; x < W; x++) {
    if (!solid(x, top)) continue;
    putPx(m, x, top, hash2(x, top, seed + 433) < 0.3 ? SEA_SNOW.lo : SEA_SNOW.mid);
    const len = x % 2 === 0 && hash2(x, 0, seed + 435) > 0.3 ? 1 + Math.floor(hash2(x, 1, seed + 437) * (lip - 1)) : 0;
    for (let k = 1; k < lip; k++) {
      const y = top + k;
      if (!solid(x, y)) continue;
      if (k <= len) putPx(m, x, y, k === len ? SEA_ICE.lo : k === 1 ? SEA_ICE.hi : SEA_ICE.mid);
      else putPx(m, x, y, mix(rgbAt(m, x, y), 0x8a9aae, 0.22));
    }
  }
}

// ── 물가 살얼음 띠 ──
export const ICE_BAND_W = 128;
/** 텍스처 높이 (되풀이하려고 2의 거듭제곱) · 띠가 쓰는 줄 */
export const ICE_BAND_TEX_H = 16;
export const ICE_BAND_H = 12;
/**
 * 물가 살얼음 (가로 128px마다 이어져요). 얇은 얼음 판이 금으로 갈라져 늘어서고, 판마다 두께가 달라요.
 * 위 끝은 밝은 테, 몸은 반투명 하늘빛, 아래 끝은 옅게 사라져요. 판 사이·아래엔 떠다니는 작은 조각
 */
export function iceBandArt(): Grid {
  const g = new Grid(ICE_BAND_W, ICE_BAND_TEX_H);
  let x = 0;
  let i = 0;
  while (x < ICE_BAND_W) {
    const len = Math.min(ICE_BAND_W - x, 7 + Math.floor(hash2(i, 0, 441) * 13));
    const top = 1 + Math.floor(hash2(i, 1, 441) * 2);
    const thick = 3 + Math.floor(hash2(i, 2, 441) * 3);
    for (let k = 0; k < len - 1; k++) {
      const px = x + k;
      // 판 끝은 둥글게 (양 끝 1px은 한 줄 얇게)
      const end = k === 0 || k === len - 2;
      const t0 = top + (end ? 1 : 0);
      const t1 = top + thick - (end ? 1 : 0);
      for (let y = t0; y <= t1; y++) {
        if (y === t0) g.set(px, y, 0xffffff, 245);
        else if (y === t1) g.set(px, y, SEA_ICE.lo, 200);
        else g.set(px, y, hash2(px, y, 443) < 0.08 ? 0xffffff : y === t0 + 1 ? SEA_ICE.hi : SEA_ICE.mid, 215);
      }
      // 판 위 눈가루 · 판 아래 물에 비친 그늘
      if (hash2(px, i, 445) < 0.18) g.set(px, t0 + 1, SEA_SNOW.hi, 230);
      if (!end) g.set(px, t1 + 1, 0x5f8fa8, 80);
    }
    // 판 사이 금 (투명) 뒤 다음 판. 가끔 아래쪽에 떠다니는 작은 조각
    if (hash2(i, 3, 441) < 0.5) {
      const fx = x + Math.floor(len / 2);
      const fy = top + thick + 2 + Math.floor(hash2(i, 4, 441) * 3);
      for (let k = 0; k < 3; k++) if (fy < ICE_BAND_H) g.set((fx + k) % ICE_BAND_W, fy, k === 1 ? SEA_ICE.hi : SEA_ICE.mid, 170);
    }
    x += len;
    i++;
  }
  return g;
}

// ── 전구 줄 ──
export const BULB_COLORS: readonly Color[] = [0xff5a5a, 0xffd25a, 0x6ad8ff, 0x8aff8a, 0xff8ad8];

/**
 * 두 점을 잇는 전구 줄. 그림 원점은 왼쪽 위, (ox, oy) = 첫 점이 그림 안에서 놓인 자리.
 * sag = 아래로 늘어지는 깊이, bow = 옆으로 늘어지는 깊이 (세로 줄 — 난간을 따라 내려가는 줄). 전구는 6px마다 색을 돌려요
 */
export function stringLights(dx: number, dy: number, sag: number, bow = 0): { grid: Grid; bulbs: Bulb[]; ox: number; oy: number } {
  const pad = 3;
  const n = Math.max(2, Math.ceil(Math.hypot(dx, dy) + sag + Math.abs(bow)) * 2);
  const at = (t: number) => ({ x: dx * t + bow * 4 * t * (1 - t), y: dy * t + sag * 4 * t * (1 - t) });
  let x0 = 0;
  let x1 = 0;
  let y0 = 0;
  let y1 = 0;
  for (let i = 0; i <= n; i++) {
    const p = at(i / n);
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const ox = pad - Math.floor(x0);
  const oy = pad - Math.floor(y0);
  const g = new Grid(Math.ceil(x1 - x0) + pad * 2 + 2, Math.ceil(y1 - y0) + pad * 2 + 2);
  const vertical = Math.abs(dy) > Math.abs(dx);
  const side = bow < 0 ? -1 : 1;
  const bulbs: Bulb[] = [];
  let prev: [number, number] | null = null;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = at(t);
    const x = Math.round(ox + p.x);
    const y = Math.round(oy + p.y);
    if (prev && prev[0] === x && prev[1] === y) continue;
    if (prev) acc += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
    g.set(x, y, 0x2a2622);
    if (acc >= 6 && t > 0.04 && t < 0.96) {
      acc = 0;
      const c = BULB_COLORS[bulbs.length % BULB_COLORS.length];
      const b = vertical ? { x: x + side, y, c } : { x, y: y + 1, c };
      g.set(b.x, b.y, c);
      bulbs.push(b);
    }
  }
  return { grid: g, bulbs, ox, oy };
}

/** 그리드에 전구 줄을 얹어요 (점 a → b). 얹은 전구 자리를 돌려줘요 */
export function drawString(g: Img, a: Pt, b: Pt, sag: number, bow = 0): Bulb[] {
  const s = stringLights(b.x - a.x, b.y - a.y, sag, bow);
  const out: Bulb[] = [];
  for (let y = 0; y < s.grid.h; y++)
    for (let x = 0; x < s.grid.w; x++) {
      const v = s.grid.get(x, y);
      if ((v & 255) === 0) continue;
      putPx(g, a.x - s.ox + x, a.y - s.oy + y, v >>> 8);
    }
  for (const p of s.bulbs) out.push({ x: a.x - s.ox + p.x, y: a.y - s.oy + p.y, c: p.c });
  return out.filter((p) => p.x >= 0 && p.y >= 0 && p.x < g.w && p.y < g.h);
}

// ── 등대 나선 전구 (seaArt lighthouseArt: 44×104, 탑 꼭대기 26 · 받침 101 · 가운데 22 · 반폭 8→15) ──
const LH = { cx: 22, top: 26, base: 101, half0: 8, half1: 7 } as const;
/**
 * 등대 탑을 감아 내려가는 전구 줄 (세 바퀴 반). 앞쪽(보이는 쪽)만 그려요 — 전선 점과 전구 자리
 */
export function lighthouseSpiral(): { wire: Pt[]; bulbs: Bulb[] } {
  const wire: Pt[] = [];
  const bulbs: Bulb[] = [];
  const y0 = LH.top + 3;
  const y1 = LH.base - 15; // 문 위에서 멈춰요
  const turns = 3.5;
  let prev: Pt | null = null;
  let acc = 0;
  const N = 900;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = y0 + (y1 - y0) * t;
    const k = (y - LH.top) / (LH.base - LH.top);
    const half = LH.half0 + k * LH.half1 - 0.5;
    const ang = t * Math.PI * 2 * turns;
    if (Math.cos(ang) < -0.05) {
      prev = null;
      continue;
    }
    const p = { x: Math.round(LH.cx + Math.sin(ang) * half), y: Math.round(y) };
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    if (prev) acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
    wire.push(p);
    if (acc >= 4) {
      acc = 0;
      bulbs.push({ x: p.x, y: p.y + 1, c: BULB_COLORS[bulbs.length % BULB_COLORS.length] });
    }
  }
  return { wire, bulbs };
}
/** 등대 전망대 난간 화환 (난간 윗줄 y 19, x 9~35) 전구 자리 */
export function lighthouseRailBulbs(): Bulb[] {
  const out: Bulb[] = [];
  for (let x = 10; x <= 34; x += 4) out.push({ x, y: 20 + ((x >> 2) % 2), c: BULB_COLORS[out.length % BULB_COLORS.length] });
  return out;
}

// ── 배 장식 줄 (뱃머리 → 돛대 꼭대기 → 고물). 그림 좌표 — seaArt boatArt·tankerArt·cargoArt ──
export const SHIP_DRESS: Readonly<Record<"boat" | "ship-tanker" | "ship-cargo", readonly Pt[]>> = {
  boat: [
    { x: 4, y: 22 },
    { x: 30, y: 1 },
    { x: 60, y: 1 },
    { x: 78, y: 22 },
  ],
  "ship-tanker": [
    { x: 3, y: 12 },
    { x: 15, y: 0 },
    { x: 124, y: 12 },
  ],
  "ship-cargo": [
    { x: 3, y: 16 },
    { x: 14, y: 1 },
    { x: 112, y: 16 },
  ],
};

/** 가로등 (seaArt lampArt 10×40) 크리스마스: 기둥에 빨강 줄무늬 리본 + 등 아래 작은 리본 매듭 */
export function ribbonLamp(m: Img): void {
  for (let y = 12; y < 34; y++) {
    if ((y >> 1) % 2) continue;
    if (alphaAt(m, 4, y) < 200) continue;
    putPx(m, 4, y, 0xd8323a);
    putPx(m, 5, y, 0xb82a30);
  }
  for (const [x, y, c] of [
    [3, 10, 0xd8323a],
    [6, 10, 0xd8323a],
    [2, 11, 0xf04a4a],
    [7, 11, 0xf04a4a],
    [4, 11, 0xb82a30],
    [5, 11, 0xb82a30],
  ] as const)
    putPx(m, x, y, c);
}

// ── 크리스마스 눈사람·선물 자리 (구역마다 하나씩, 앵커 둘레에서 가장 가까운 빈 눈밭) ──
/** 앵커: 정류장 옆 풀밭 · 백사장 서쪽·가운데·동쪽 (선베드 사이 빈 모래) */
// 11/19 정류장 옆 풀밭에 11번 터가 생겨 눈사람은 터 아래로, 선물은 6번 터와 정류장 길 사이로
const SNOWMAN_ANCHORS: readonly Pt[] = [
  { x: 1626, y: 292 },
  { x: 250, y: 420 },
  { x: 712, y: 384 },
  { x: 1700, y: 372 },
];
const GIFT_ANCHORS: readonly Pt[] = [
  { x: 1456, y: 384 },
  { x: 742, y: 420 },
  { x: 1520, y: 240 },
];

let spots: { snowmen: Pt[]; gifts: Pt[] } | null = null;
/** 크리스마스판 눈사람·선물 더미 자리 (충돌·쉴거리·장식·길·산책로·물가를 피해요. 유령선 자리는 물이라 닿지 않아요) */
export function seaXmasSpots(): { snowmen: Pt[]; gifts: Pt[] } {
  if (spots) return spots;
  const rects: Rect[] = [...seaStaticColliders(), ...seaFurnitureColliders(), ...SEA_DECKS];
  const points: Pt[] = [
    ...SEA_SPOTS.loungers,
    ...SEA_SPOTS.parasols,
    ...SEA_SPOTS.benches,
    ...SEA_SPOTS.sandcastles,
    SEA_SPOTS.hammock,
    SEA_SPOTS.swing,
    SEA_SPOTS.bonfire,
    ...SEA_FURNITURE,
    ...SEA_MATS,
    ...SEA_SCOPES,
    ...SEA_DECOR,
    ...SEA_TREES,
    ...SEA_LAMPS,
    ...SEA_INTERACTABLES,
  ];
  const placed: Pt[] = [];
  const free = (x: number, y: number) => {
    const k = seaGroundKind(x, y);
    if (k !== "grass" && k !== "sand" && k !== "yard") return false;
    if (k === "sand" && (y > seaSnowLineY(x) - 26 || y > SEA_FLAT_Y0 - 60)) return false;
    if (pathEdgeDist(x, y) < 8) return false;
    if (!seaStandable(x, y) || !seaStandable(x - 8, y) || !seaStandable(x + 8, y)) return false;
    if (rects.some((r) => x > r.x - 12 && x < r.x + r.w + 12 && y > r.y - 8 && y < r.y + r.h + 30)) return false;
    if (points.some((p) => Math.abs(p.x - x) < 24 && Math.abs(p.y - y) < 24)) return false;
    const G = SEA_GHOST_BERTH.clear;
    if (x > G.x - 20 && x < G.x + G.w + 20 && y > G.y - 40 && y < G.y + G.h + 20) return false;
    return !placed.some((p) => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 24);
  };
  const near = (a: Pt): Pt | null => {
    let best: Pt | null = null;
    let bd = Infinity;
    for (let y = a.y - 90; y <= a.y + 90; y += 4)
      for (let x = a.x - 90; x <= a.x + 90; x += 4) {
        const d = (x - a.x) ** 2 + (y - a.y) ** 2;
        if (d >= bd || d > 90 * 90 || !free(x, y)) continue;
        bd = d;
        best = { x, y };
      }
    if (best) placed.push(best);
    return best;
  };
  const snowmen = SNOWMAN_ANCHORS.map(near).filter((p): p is Pt => !!p);
  const gifts = GIFT_ANCHORS.map(near).filter((p): p is Pt => !!p);
  spots = { snowmen, gifts };
  return spots;
}
