// 11/21 시안 전용 (dev/camp-mock): 「언젠가 캠핑장」 폭포 계곡 + 카라반 분양 배치안. 실제 맵·서버 좌표(protocol camp.ts)와 무관하다.
// 지울 때는 game/camp/mock/ 폴더와 app/dev/camp-mock/ 만 지우면 된다. 채택되면 이 좌표를 protocol camp.ts로 옮긴다.
//
//  y=0   ┌ 숲 ───────────── ╔══ 강 ══╗ ─────────────── 숲 ─ [전망대] ┐
//        │                ▟▛ 절벽 ║폭포║ 절벽 ▜▙                      │
//        │  🎄 모닥불 광장   ▙  (  큰 웅덩이  )  ▟      바베큐·자판기     │
//        │   (12 통나무)   [9][1]  ══다리══  [7][3]    숲 산책로        │
//        │                [10][2]   ╲계곡╱   [8][4]                    │
//        │ [정류장]         [11][3?]  ┄돌┄    ...       큰 타프          │
//  y=800 └═버스 길═ [관리소·매점] ──── 통나무 다리 ─────────────────────┘

import { CAMP_BUS_STOP, CAMP_OFFICE, CAMP_OFFICE_H, CAMP_OFFICE_W, CAMP_ROAD } from "@tomb/protocol";
import { hashU } from "../campLayout";

export const MW = 1280;
export const MH = 800;
export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

// ── 폭포 절벽 (위 가운데) ── 바위 덩이 여럿이 뒤 → 앞으로 겹쳐 말굽처럼 웅덩이를 감싼다.
// 덩이마다: 윗면(눈 덮인 마루, cap ~ cap+thick) + 앞면(바위 벽, ~ base). 뒤 덩이(가운데·가장 높다)에 폭포가 있다.
export const FALL_X = 640;
export const CLIFF_X0 = 424;
export const CLIFF_X1 = 856;
const CLIFF_HALF = (CLIFF_X1 - CLIFF_X0) / 2;
/** 절벽 전체 밑동 (웅덩이 위 호를 따라 좌우로 내려온다) */
function envelopeBase(x: number): number {
  const u = Math.min(1, Math.abs(x - FALL_X) / CLIFF_HALF);
  return 196 + 76 * u * u;
}
export type Mass = { id: string; x0: number; x1: number; cap: number; thick: number; drop: number; seed: number; jag: number };
/** 뒤 → 앞 순서 (그리는 순서) */
export const MASSES: readonly Mass[] = [
  // 가운데 덩이 윗면은 맵 위 밖 (폭포가 화면 위 끝에서 바로 쏟아진다 — 물의 출발점은 보이지 않게)
  { id: "M0", x0: 474, x1: 810, cap: -24, thick: 10, drop: 0, seed: 1, jag: 7 },
  { id: "M1L", x0: 438, x1: 576, cap: 84, thick: 9, drop: 5, seed: 2, jag: 6 },
  { id: "M1R", x0: 708, x1: 856, cap: 78, thick: 9, drop: 5, seed: 3, jag: 6 },
];
/** 덩이 윗선 (어깨는 둥글게 떨어진다) */
/** 6차: 바깥 끝은 가는 꼬리 대신 둥근 바위 코(밑은 판판하게 땅에 앉는다) — 밑동엔 돌무더기(SCREE) */
const NOSE = 22;
function outerE(m: Mass, x: number): number {
  if (m.id === "M1L" && x - m.x0 < m.x1 - x) return x - m.x0;
  if (m.id === "M1R" && m.x1 - x < x - m.x0) return m.x1 - x;
  return 999;
}
function noseX(m: Mass): number {
  return m.id === "M1L" ? m.x0 + NOSE : m.x1 - NOSE;
}
export function massCap(m: Mass, x: number): number {
  if (x < m.x0 || x > m.x1) return 9999;
  const e = outerE(m, x);
  if (e < NOSE) {
    const nx = noseX(m);
    const capN = rawCap(m, nx);
    const baseN = rawBase(m, nx);
    const k = Math.sqrt(Math.max(0, 1 - ((NOSE - e) / NOSE) ** 2));
    return Math.round(baseN - (baseN - capN) * k + (hashU(x >> 1, m.seed, 913) - 0.5) * 2);
  }
  return rawCap(m, x);
}
function rawCap(m: Mass, x: number): number {
  const e = Math.min(x - m.x0, m.x1 - x);
  const sh = 22;
  // 바깥쪽 끝(왼쪽 덩이의 왼쪽, 오른쪽 덩이의 오른쪽)은 길게 비탈져 숲으로 내려앉는다 — 반듯한 벽 끝이 보이지 않게
  const outer = (m.id === "M1L" && x - m.x0 < m.x1 - x) || (m.id === "M1R" && m.x1 - x < x - m.x0);
  const osh = 84;
  const fall = Math.max(0, envelopeBase(x) - m.cap - 14);
  const shoulder = outer && e < osh ? (1 - Math.sqrt(1 - ((osh - e) / osh) ** 2)) * fall * 0.92 : e < sh ? (1 - Math.sqrt(1 - ((sh - e) / sh) ** 2)) * 34 : 0;
  const jag = m.id === "S" ? 0 : (hashU(x >> 3, m.seed, 905) - 0.5) * m.jag * 2 + Math.sin(x * 0.045 + m.seed) * m.jag * 0.6 + (hashU(x >> 1, m.seed, 907) - 0.5) * 2;
  return Math.round(m.cap + shoulder + jag);
}
export function massBase(m: Mass, x: number): number {
  if (outerE(m, x) < NOSE) return rawBase(m, noseX(m));
  return rawBase(m, x);
}
function rawBase(m: Mass, x: number): number {
  const full = Math.round(envelopeBase(x) + m.drop + (hashU(x >> 3, m.seed, 909) - 0.5) * 3);
  // 바깥쪽 비탈: 밑동도 올라와 덩이가 뾰족하게 숲 바닥으로 사라진다 (아래가 부채처럼 퍼지지 않게)
  const e = x - m.x0 < m.x1 - x ? x - m.x0 : m.x1 - x;
  const outer = (m.id === "M1L" && x - m.x0 < m.x1 - x) || (m.id === "M1R" && m.x1 - x < x - m.x0);
  if (!outer || e >= 84) return full;
  const top = rawCap(m, x) + m.thick + 3;
  return Math.round(top + (full - top) * Math.pow(e / 84, 0.7));
}
/** 맨 위 덩이 윗선 (= 절벽 위 마루가 끝나는 곳) */
export function cliffTop(x: number): number {
  let t = 9999;
  for (const m of MASSES) if (m.id !== "S" && x >= m.x0 && x <= m.x1) t = Math.min(t, massCap(m, x));
  return t;
}
/** 맨 앞 덩이 밑동 */
export function cliffBase(x: number): number {
  let b = -1;
  for (const m of MASSES) if (m.id !== "S" && x >= m.x0 && x <= m.x1) b = Math.max(b, massBase(m, x));
  return b;
}
/** (x,y)가 절벽 위 마루(높은 땅)인지 */
export function onPlateau(x: number, y: number): boolean {
  return x > CLIFF_X0 && x < CLIFF_X1 && cliffBase(x) > 0 && y < cliffTop(x);
}
/** 절벽(윗면·앞면) 안인지 */
export function inCliffFace(x: number, y: number): boolean {
  const b = cliffBase(x);
  return b > 0 && y >= cliffTop(x) && y < b;
}

/** 위 마루를 흘러 폭포 입구로 들어오는 강 (맵 위 끝 → 입구) */
export const UPPER_RIVER: readonly Pt[] = [
  { x: 668, y: -4 },
  { x: 652, y: 14 },
  { x: 640, y: 40 },
];
export const UPPER_RIVER_HW = 14;
export function upperRiverX(y: number): number {
  const p = UPPER_RIVER;
  if (y <= p[0].y) return p[0].x;
  for (let i = 1; i < p.length; i++) if (y <= p[i].y) return p[i - 1].x + ((p[i].x - p[i - 1].x) * (y - p[i - 1].y)) / (p[i].y - p[i - 1].y);
  return p[p.length - 1].x;
}

/**
 * 물줄기 (화면 좌표, 위 → 아래). x0/x1 = 위·아래 폭의 왼쪽·오른쪽 끝. kind: main(굵은 물)·thin(가는 줄기)·ice(얼어붙은 줄기)
 * 1단: 입구 → 바위 선반 (좁고 빠르게), 선반에서 물이 고였다 넘쳐 2단: 선반 → 웅덩이 (넓게, 가운데 바위가 두 갈래로 나눈다)
 */
export type FallStrand = { id: string; top: number; bottom: number; xt: [number, number]; xb: [number, number]; kind: "main" | "thin" | "ice" };
export const FALL_LEDGE_Y = 104;
export const FALLS: readonly FallStrand[] = [
  { id: "f1", top: -10, bottom: FALL_LEDGE_Y - 2, xt: [624, 656], xb: [620, 660], kind: "main" },
  { id: "f2a", top: FALL_LEDGE_Y - 6, bottom: 206, xt: [612, 650], xb: [598, 645], kind: "main" },
  { id: "f2b", top: FALL_LEDGE_Y - 6, bottom: 206, xt: [655, 668], xb: [657, 682], kind: "main" },
  { id: "rib", top: 86, bottom: 214, xt: [516, 521], xb: [517, 523], kind: "thin" },
  { id: "ice", top: 78, bottom: 212, xt: [768, 792], xb: [764, 796], kind: "ice" },
];
/** 1단 물줄기가 떨어지는 둥근 바위 혹 (가운데 아래, 거품을 이고 있다) */
export const KNOB = { x: 640, y: 112, rx: 32, ry: 13 } as const;
/** 2단 가운데를 가르는 바위 혹 */
export const FALL_SPLIT = { x: 651, y: 160 } as const;

// ── 큰 웅덩이 (폭포 아래) ──
export const POOL = { x: 640, y: 272, rx: 174, ry: 76 } as const;
/** 웅덩이 가장자리 흔들림 포함 거리 (1 = 물가) */
export function poolD(x: number, y: number): number {
  const dx = (x - POOL.x) / POOL.rx;
  const dy = (y - POOL.y) / POOL.ry;
  const a = Math.atan2(dy, dx);
  const wob = 1 + Math.sin(a * 3 + 0.4) * 0.05 + Math.sin(a * 5 + 0.6) * 0.035 + Math.sin(a * 9 + 2.1) * 0.02;
  return Math.hypot(dx, dy) / wob;
}
/** 물이 떨어지는 자리 (웅덩이 안, 거품·물안개 가운데) */
export const PLUNGE = { x: 638, y: 214 } as const;

// ── 계곡 (웅덩이 → 맵 아래 끝, 완만한 S자) ──
export const STREAM: readonly Pt[] = [
  { x: 640, y: 336 },
  { x: 628, y: 396 },
  { x: 650, y: 462 },
  { x: 680, y: 530 },
  { x: 664, y: 600 },
  { x: 626, y: 664 },
  { x: 632, y: 732 },
  { x: 650, y: 812 },
];
export const STREAM_HW = 22;
export function streamX(y: number): number {
  const p = STREAM;
  if (y <= p[0].y) return p[0].x;
  for (let i = 1; i < p.length; i++)
    if (y <= p[i].y) {
      const t = (1 - Math.cos(((y - p[i - 1].y) / (p[i].y - p[i - 1].y)) * Math.PI)) / 2;
      return p[i - 1].x + (p[i].x - p[i - 1].x) * t;
    }
  return p[p.length - 1].x;
}
/** 물살 (작은 턱: 하얀 거품 띠) */
export const RAPIDS: readonly number[] = [438, 512, 640];
/** 건너는 곳: 폭포 다리(웅덩이 바로 아래, 폭포를 마주 본다) · 징검다리 · 통나무 다리 */
export const VIEW_BRIDGE = { y: 380, w: 96, h: 34 } as const;
export const STONES_Y = 572;
export const LOG_BRIDGE_Y = 716;
export const STEP_STONES: readonly Pt[] = [-27, -9, 9, 27].map((dx, i) => ({ x: Math.round(streamX(STONES_Y) + dx), y: STONES_Y + (i % 2 ? -3 : 3) }));
/** 계곡 물 안 (웅덩이 제외) */
export function inStream(x: number, y: number, pad = 0): boolean {
  return y > 300 && Math.abs(x - streamX(y)) <= STREAM_HW + pad;
}

// ── 카라반 자리 12 (물가 앞줄 6 · 숲 쪽 뒷줄 6) ──
export type CaravanKind = "teardrop" | "airstream" | "bus";
export type Site = { n: number; x: number; y: number; side: -1 | 1; row: "front" | "back"; kind: CaravanKind | null; color: number; lit?: boolean };
/** 자리 크기 (자갈 마당 + 나무 테두리) */
export const SITE_W = 80;
export const SITE_H = 76;
const frontX = (y: number, side: -1 | 1) => Math.round(streamX(y) + side * 126);
const backX = (y: number, side: -1 | 1) => Math.round(streamX(y) + side * 240);
const FRONT_Y = [414, 514, 614] as const;
const BACK_Y = [338, 438, 538] as const;
/** 종류·색 (빈 자리 = 분양 전: 번호 팻말만) */
const PLAN: readonly [CaravanKind | null, number][] = [
  ["airstream", 0], // 1 왼쪽 앞
  ["teardrop", 1], // 2
  [null, 0], // 3
  ["bus", 0], // 4 오른쪽 앞
  [null, 0], // 5
  ["teardrop", 3], // 6
  ["teardrop", 0], // 7 왼쪽 뒤
  [null, 0], // 8
  ["bus", 1], // 9
  ["airstream", 1], // 10 오른쪽 뒤
  ["teardrop", 2], // 11
  [null, 0], // 12
];
export const SITES: readonly Site[] = [
  ...FRONT_Y.map((y, i) => ({ n: i + 1, x: frontX(y, -1), y, side: -1 as const, row: "front" as const })),
  ...FRONT_Y.map((y, i) => ({ n: i + 4, x: frontX(y, 1), y, side: 1 as const, row: "front" as const })),
  ...BACK_Y.map((y, i) => ({ n: i + 7, x: backX(y, -1), y, side: -1 as const, row: "back" as const })),
  ...BACK_Y.map((y, i) => ({ n: i + 10, x: backX(y, 1), y, side: 1 as const, row: "back" as const })),
].map((s) => ({ ...s, kind: PLAN[s.n - 1][0], color: PLAN[s.n - 1][1], lit: s.n % 3 !== 0 }));

export function inSite(x: number, y: number, pad = 0): Site | null {
  for (const s of SITES) if (Math.abs(x - s.x) <= SITE_W / 2 + pad && Math.abs(y - s.y) <= SITE_H / 2 + pad) return s;
  return null;
}

// ── 다른 시설 (옮긴 자리) ──
/** 큰 모닥불 광장 → 오른쪽 아래 「캠프파이어 존」 (예전 큰 타프 자리) */
export const FIRE = { x: 1118, y: 670 } as const;
export const PLAZA_R = 88;
export const LOG_RX = 64;
export const LOG_RY = 50;
export const XTREE_AT = { x: FIRE.x, y: FIRE.y - 70 } as const;
export const LIGHT_POLES: readonly Pt[] = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
  return { x: Math.round(FIRE.x + Math.cos(a) * 100), y: Math.round(FIRE.y + 8 + Math.sin(a) * 82) };
});
export const LOG_SEATS: readonly Pt[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return { x: Math.round(FIRE.x + Math.cos(a) * LOG_RX), y: Math.round(FIRE.y + 6 + Math.sin(a) * LOG_RY) };
});
/** 캠프파이어 존 작은 불멍 자리 둘 (벤치 쉼터 · 해먹 쉼터) */
export const PITS: readonly { x: number; y: number; kind: "bench" | "hammock" }[] = [
  { x: 978, y: 604, kind: "bench" },
  { x: 968, y: 744, kind: "hammock" },
];
/** 마시멜로·핫도그 수레 */
export const SNACK = { x: 1238, y: 756 } as const;
/** 장작더미 */
export const WOOD_STACKS: readonly Pt[] = [
  { x: 1240, y: 616 },
  { x: 1052, y: 770 },
  { x: 1020, y: 566 },
];
/** 버스 정류장·길·관리소는 그대로 (버스 도착 연출이 이 좌표를 쓴다) */
export const BUS_STOP = CAMP_BUS_STOP;
export const ROAD = CAMP_ROAD;
export const OFFICE = CAMP_OFFICE;
export const OFFICE_RECT: Rect = { x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2, y: CAMP_OFFICE.y - CAMP_OFFICE_H, w: CAMP_OFFICE_W, h: CAMP_OFFICE_H };
export const BOARD_SPOT = { x: 520, y: 684 } as const;
/** 분양 안내판 (관리소 옆) */
export const SALE_BOARD = { x: 384, y: 708 } as const;
/** 폭포 다리 앞 작은 모닥불 (통나무 넷 — 폭포를 보며 불멍) */
export const SMALL_FIRE = { x: 556, y: 362 } as const;
export const SMALL_SEATS: readonly Pt[] = [
  { x: 533, y: 360 },
  { x: 579, y: 360 },
  { x: 543, y: 378 },
  { x: 569, y: 378 },
];
/** 웅덩이 희귀 물고기 반짝임 자리 (UI 없음) */
export const RARE_GLINT = { x: 712, y: 298 } as const;
/** 바베큐장·자판기 (캠프파이어 존 윗줄 — 숲 오솔길 들머리) */
export const BBQ = {
  grill: { x: 1112, y: 552 },
  table: { x: 1160, y: 566 },
  vending: { x: 1206, y: 546 },
  area: { x: 1088, y: 520, w: 140, h: 56 },
} as const;

// ── 「윤슬 낚시터」 — 직사각 저수지 (돌 석축 둑 + 둘레 둑길) ──
export const RES = { x0: 984, y0: 96, x1: 1216, y1: 472 } as const;
/** 석축 폭 (물가 → 둑길) */
export const EMBANK = 10;
/** 물가에서 둘레 둑길 가운데까지 */
export const RING = 26;
export const POND = { x: (RES.x0 + RES.x1) / 2, y: (RES.y0 + RES.y1) / 2, rx: (RES.x1 - RES.x0) / 2, ry: (RES.y1 - RES.y0) / 2 } as const;
/** 물가까지 거리 (물 안은 음수 — 가장 가까운 물가까지) */
export function resEdge(x: number, y: number): number {
  const dx = Math.max(RES.x0 - x, x - RES.x1);
  const dy = Math.max(RES.y0 - y, y - RES.y1);
  if (dx <= 0 && dy <= 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(0, dx), Math.max(0, dy));
}
export function pondD(x: number, y: number): number {
  return resEdge(x, y) <= 0 ? 0.5 : 2;
}
/** 서쪽 둑에서 동쪽으로 뻗은 넓은 잔교 (폭 2칸) */
export const PIER = { y: 260, x0: RES.x0 - EMBANK, x1: 1198, w: 32 } as const;
/** 좌대 여섯 (2인 — 의자 둘·낚싯대 둘). near = 잔교에 등을 대고 붙은 줄(걸어서), far = 물 건너 줄(헤엄쳐서 — 앞 사다리) */
export const RAFTS: readonly (Pt & { n: number; link: boolean; roof: number })[] = [
  { n: 1, x: 1026, y: 324, link: true, roof: 0 },
  { n: 2, x: 1100, y: 324, link: true, roof: 1 },
  { n: 3, x: 1174, y: 324, link: true, roof: 2 },
  { n: 4, x: 1026, y: 174, link: false, roof: 3 },
  { n: 5, x: 1100, y: 174, link: false, roof: 4 },
  { n: 6, x: 1174, y: 174, link: false, roof: 5 },
];
/** 관리 부스 (미끼·대여) · 이름 팻말 (서쪽 둑길 밖) · 「수영해서 갈 수 있어요」 팻말 (남쪽 둑) */
export const BOOTH = { x: 904, y: 186 } as const;
export const POND_SIGN = { x: 918, y: 236 } as const;
export const SWIM_SIGN = { x: 1092, y: 128 } as const;
/** 겨울 얼음낚시 구멍 (가장자리 언 곳) */
export const ICE_HOLES: readonly Pt[] = [
  { x: 1000, y: 112 },
  { x: 1202, y: 456 },
  { x: 1202, y: 112 },
];
/** 둑 낚시 자리 (석축 위 — 물을 본다) */
export const POND_SPOTS: readonly (Pt & { dir: "up" | "down" | "left" | "right" })[] = [
  ...[140, 204, 336].map((y) => ({ x: RES.x0 - 6, y, dir: "right" as const })),
  ...[1040, 1100, 1160].map((x) => ({ x, y: RES.y1 + 8, dir: "up" as const })),
  ...[130, 214, 304, 392].map((y) => ({ x: RES.x1 + 6, y, dir: "left" as const })),
  ...[1060, 1140].map((x) => ({ x, y: RES.y0 - 4, dir: "down" as const })),
];

// ── 6차 (11/25) ──
/** 윤슬 낚시터 나룻배 선착장 (서쪽 둑에서 물 위로) · 2인 나룻배 셋 (둘은 매어 두고, 하나는 물 위) */
export const ROW_DOCK = { x0: RES.x0 - EMBANK, y: 420, len: 62 } as const;
/** 좌대 구역 ↔ 배 구역 가르는 부표 줄 */
export const BUOY_LINE = { x0: RES.x0 + 4, x1: RES.x1 - 4, y: 368 } as const;
export const ROWBOATS: readonly (Pt & { moored: boolean; tint: number })[] = [
  { x: 1022, y: 402, moored: true, tint: 0 },
  { x: 1026, y: 440, moored: true, tint: 1 },
  { x: 1140, y: 424, moored: false, tint: 2 },
];
export const BOAT_SIGN = { x: 926, y: 438 } as const;
/** 절벽 양 끝 밑동 돌무더기 (바닥 가운데) */
export const SCREE: readonly (Pt & { seed: number; flip: boolean })[] = [
  { x: 462, y: 202, seed: 1, flip: false },
  { x: 836, y: 206, seed: 2, flip: true },
];
/** 달그늘 소 양옆 낚시 바위 여섯 (왼쪽 셋은 오른쪽 물을, 오른쪽 셋은 왼쪽 물을 본다) */
export const POOL_ROCKS: readonly (Pt & { side: -1 | 1 })[] = [
  { x: 488, y: 246, side: -1 },
  { x: 482, y: 276, side: -1 },
  { x: 492, y: 306, side: -1 },
  { x: 792, y: 246, side: 1 },
  { x: 798, y: 276, side: 1 },
  { x: 788, y: 306, side: 1 },
];
/** 자판기 줄 (소 오른쪽 둑, 동쪽 길을 보고 나란히) */
export const VENDING_ROW: readonly Pt[] = [842, 866, 890].map((x) => ({ x, y: 264 }));
/** 계곡 족욕탕 (예전 펜션 바베큐 마당 자리) — 바닥 가운데 기준 */
export const FOOTBATH_AT = { x: 392, y: 194 } as const;
export const FOOT_BENCHES: readonly Pt[] = [
  { x: 380, y: 262 },
  { x: 414, y: 262 },
];

// ── 「소슬 펜션 마을」 (5차) — 둘레 울타리 없이 길·마당으로 이어진 마을. 펜션 2 + 촌캉스(시골집) 2, 엇갈려 흩어 놓는다 ──
/** 앞마당 등급 (집 크기와 별개). 발자국(HOME_FP)은 처음부터 Lv3 크기만큼 비워 둔다 */
export type YardLv = 1 | 2 | 3;
export type HomeKind = "pension" | "rural";
export type HomeSize = "small" | "wide";
export type Home = { id: string; kind: HomeKind; n: number; size: HomeSize; x0: number; y0: number; lv: YardLv; owner: string | null; name: string; roof: number; v: number };
/** 발자국 (집 + 앞마당 Lv3 전부, 왼쪽 위 기준) */
export const HOME_FP = {
  pension: { wide: { w: 136, h: 124 }, small: { w: 116, h: 118 } },
  rural: { wide: { w: 156, h: 160 }, small: { w: 134, h: 168 } },
} as const;
export const HOMES: readonly Home[] = [
  // 6차: 촌캉스는 위(마을 길 북쪽), 펜션은 아래(넓은 펜션 정원·놀이터와 한 구역)
  { id: "p1", kind: "pension", n: 1, size: "wide", x0: 8, y0: 234, lv: 3, owner: "솜사탕네", name: "솔바람채", roof: 0, v: 0 },
  { id: "p2", kind: "pension", n: 2, size: "small", x0: 190, y0: 238, lv: 3, owner: null, name: "달빛채", roof: 2, v: 1 },
  { id: "r1", kind: "rural", n: 1, size: "wide", x0: 4, y0: 36, lv: 2, owner: "마시멜로네", name: "감나무집", roof: 0, v: 0 },
  { id: "r2", kind: "rural", n: 2, size: "small", x0: 182, y0: 28, lv: 2, owner: null, name: "싸리울집", roof: 0, v: 1 },
];
export const fpOf = (h: Pick<Home, "kind" | "size">) => HOME_FP[h.kind][h.size];

/**
 * 집 안 배치 (발자국 왼쪽 위 기준). 펜션: px = 테라스 가운데, deckFront = 테라스 앞 가장자리.
 * 등급: Lv1 데크 + 4인 테이블 / Lv2 + 파라솔 2자리 · 바비큐 그릴(연기) / Lv3 + 온수 스파 2자리(김) · 줄조명
 */
export const PENSION_PLAN = {
  wide: { px: 54, deckFront: 110, grill: { x: 119, y: 62 }, spa: { x: 119, y: 122 }, pole: { x: 134, y: 98 }, dine: -26, parasol: 22 },
  small: { px: 42, deckFront: 104, grill: { x: 98, y: 56 }, spa: { x: 100, y: 116 }, pole: { x: 114, y: 92 }, dine: -18, parasol: 20 },
} as const;
/**
 * 촌캉스: Lv1 평상(방석 4) + 아궁이·가마솥 / Lv2 + 밥상(작은 의자 2) · 장독대 · 아궁이 연기 / Lv3 평상 → 정자(4) + 화톳불(통나무 2) · 감나무 줄조명.
 * 돌담은 발자국 테두리, 대문은 gate (front = 앞 담, left = 왼 담 · 범위 a..b)
 */
export const RURAL_PLAN = {
  wide: {
    house: { x: 58, y: 72 },
    tree: { x: 132, y: 70 },
    jangdok: { x: 132, y: 104, big: 3, small: 3 },
    pyeong: { x: 78, y: 130 },
    agungi: { x: 130, y: 150 },
    table: { x: 30, y: 152 },
    fire: { x: 78, y: 146 },
    line: { x: 26, y: 110 } as Pt | null,
    garden: null as Pt | null,
    gate: { side: "front" as "front" | "left", a: 86, b: 104 },
  },
  // 7차: 작은 집은 싸리 울타리(불규칙) — 감나무·장독대는 왼쪽, 평상은 오른쪽, 텃밭은 앞
  small: {
    house: { x: 74, y: 64 },
    tree: { x: 26, y: 62 },
    jangdok: { x: 28, y: 104, big: 2, small: 3 },
    pyeong: { x: 102, y: 112 },
    agungi: { x: 106, y: 152 },
    table: { x: 40, y: 150 },
    fire: { x: 104, y: 162 },
    line: null as Pt | null,
    garden: { x: 70, y: 162 } as Pt | null,
    gate: { side: "left" as "front" | "left", a: 126, b: 140 },
  },
} as const;
/** 자리 수 (앉는 곳) — 등급별 */
export const SEATS = { pension: { 1: 4, 2: 6, 3: 8 }, rural: { 1: 4, 2: 6, 3: 8 } } as const;

/** 마을 길: 정류장 → 입구 아치 → 오른쪽 길 → 마을 한가운데 흙길 (집 사이를 굽이쳐 서쪽 숲까지) */
export const LANE_X = 338;
export const VILLAGE_Y = 211;
/** 입구 아치 (울타리 없이 길 위에 홀로 선 마을 표지) · 바베큐 마당 쪽 출구 */
export const PENSION_GATE = { x: 330, y: 540 } as const;
export const SIDE_GATE = { x: 440, y: VILLAGE_Y } as const;
/** 펜션 사장님 (입구 아치 옆) · 「펜션 분양」 안내판 */
export const PENSION_HOST = { x: 290, y: 566 } as const;
export const PENSION_SALE_SIGN = { x: 372, y: 572 } as const;
/** 놀이터: 대형 트램펄린(8인) · 워터 슬라이드(겨울엔 눈썰매장) */
export const TRAMPOLINE = { x: 62, y: 470, rx: 48, ry: 28 } as const;
export const SLIDE = { x: 262, y: 472, pool: { x: 238, y: 516, rx: 30, ry: 12 } } as const;
/** 6차 펜션 정원 (울타리 없는 잔디 마당): 공용 바비큐·피크닉 · 파라솔 · 그네 의자 · 흔들 의자 · 화단 · 줄조명 기둥 */
export const PGARDEN = { x0: 6, y0: 386, x1: 318, y1: 552 } as const;
/** 7차 펜션 구역 소품 (정원 가운데: 연못·다리 → 벤치 → 화로대 불멍 → 그네·해먹) */
export const PG_POND = { x: 160, y: 430 } as const;
export const PG_BENCH = { x: 160, y: 450 } as const;
export const PG_FIRE = { x: 160, y: 486 } as const;
export const PG_FIRE_SEATS: readonly Pt[] = [
  { x: 138, y: 484 },
  { x: 182, y: 484 },
  { x: 146, y: 502 },
  { x: 174, y: 502 },
];
export const PG_WOOD = { x: 198, y: 506 } as const;
export const PG_SWING = { x: 136, y: 546 } as const;
export const PG_HAMMOCK = { x: 186, y: 550 } as const;
export const PG_PLANTERS: readonly (Pt & { len: number })[] = [
  { x: 30, y: 552, len: 30 },
  { x: 92, y: 552, len: 30 },
  { x: 300, y: 404, len: 22 },
  { x: 244, y: 404, len: 22 },
];
export const PG_SIGN = { x: 248, y: 574 } as const;
/** 싸리울집 울타리 (발자국 기준 · 대문 자리 = 왼쪽 126~140 비움) */
export const BRUSH_FENCE: readonly Pt[] = [
  { x: 4, y: 140 },
  { x: 12, y: 160 },
  { x: 64, y: 166 },
  { x: 116, y: 161 },
  { x: 127, y: 128 },
  { x: 131, y: 74 },
  { x: 124, y: 18 },
  { x: 66, y: 10 },
  { x: 8, y: 16 },
  { x: 3, y: 70 },
  { x: 4, y: 126 },
];
export const PG_ARCH = { x: 166, y: 306 } as const;
export const PG_LAMPS: readonly Pt[] = [
  { x: 150, y: 346 },
  { x: 182, y: 346 },
  { x: 112, y: 396 },
  { x: 212, y: 396 },
];
export const PG_SHRUBS: readonly (Pt & { v: number })[] = [
  { x: 122, y: 404, v: 0 },
  { x: 200, y: 404, v: 1 },
  { x: 314, y: 366, v: 0 },
  { x: 6, y: 372, v: 1 },
];
export const PG_TREE = { x: 26, y: 408 } as const;
export const PG_BIKE = { x: 184, y: 262 } as const;
export const PG_CAR = { x: 48, y: 592 } as const;
/** 펜션마다 디딤돌 (계단 → 앞 길) */
export const PG_STEPS: readonly Pt[] = [
  { x: 62, y: 364 },
  { x: 60, y: 372 },
  { x: 232, y: 362 },
  { x: 234, y: 370 },
  { x: 164, y: 394 },
  { x: 160, y: 402 },
];
/** 펜션 바베큐 마당 (오른쪽 위 넓은 곳) */
export const PBBQ = { x: 398, y: 170, w: 80, h: 240 } as const;
export const PBBQ_GRILLS: readonly Pt[] = [
  { x: 376, y: 108 },
  { x: 420, y: 108 },
  { x: 376, y: 168 },
];
export const PBBQ_DECKS: readonly Pt[] = [
  { x: 414, y: 176 },
  { x: 398, y: 282 },
];
/** 집 발자국 안인지 (pad만큼 넓혀서) */
export function inHome(x: number, y: number, padX = 0, padTop = 0, padBottom = padTop): boolean {
  for (const h of HOMES) {
    const f = fpOf(h);
    if (x >= h.x0 - padX && x <= h.x0 + f.w + padX && y >= h.y0 - padTop && y <= h.y0 + f.h + padBottom) return true;
  }
  return false;
}

// ── 길 ──
export type MockPath = { id: string; hw: number; pts: readonly Pt[]; foot?: true };
function bankPath(side: -1 | 1, y0: number, y1: number, off: number): Pt[] {
  const out: Pt[] = [];
  for (let y = y0; y <= y1; y += 24) out.push({ x: Math.round(streamX(y) + side * off), y });
  return out;
}
/** 카라반 골목 (앞줄과 뒷줄 사이, 계곡을 따라) */
function alley(side: -1 | 1, y0: number, y1: number): Pt[] {
  return bankPath(side, y0, y1, 183);
}
const PL = POOL;
export const PATHS: readonly MockPath[] = [
  // 정류장 → 관리소 앞 → 통나무 다리 → 캠프파이어 존 (폭 2칸)
  {
    id: "trail",
    hw: 16,
    pts: [
      { x: 214, y: 640 },
      { x: 284, y: 650 },
      { x: 318, y: 712 },
      { x: 404, y: 728 },
      { x: 520, y: 722 },
      { x: 600, y: LOG_BRIDGE_Y },
      { x: 680, y: LOG_BRIDGE_Y },
      { x: 780, y: 724 },
      { x: 900, y: 716 },
      { x: 936, y: 690 },
      { x: 1022, y: 672 },
    ],
  },
  // 펜션 마을: 정류장 → 입구 아치 → 오른쪽 길 → 마을 흙길 (집 사이를 굽이친다) · 바베큐 마당
  { id: "lane", hw: 16, pts: [{ x: 214, y: 640 }, { x: 290, y: 596 }, { x: 330, y: 560 }, { x: 330, y: 476 }, { x: LANE_X, y: 420 }, { x: LANE_X, y: VILLAGE_Y }] },
  { id: "village", hw: 14, pts: [{ x: LANE_X, y: VILLAGE_Y }, { x: 262, y: 213 }, { x: 171, y: 212 }, { x: 98, y: 214 }, { x: -4, y: 212 }] },
  { id: "toBbq", hw: 16, pts: [{ x: LANE_X, y: VILLAGE_Y }, { x: SIDE_GATE.x, y: VILLAGE_Y }] },
  // 촌캉스 두 집 사이 골목 (돌담집 옆 대문)
  { id: "alley", hw: 8, pts: [{ x: 171, y: 212 }, { x: 171, y: 163 }, { x: 186, y: 163 }] },
  // 펜션 앞 정원 길 (마을 길 → 두 펜션 사이 → 정원 앞 → 오른쪽 길)
  { id: "pgap", foot: true, hw: 10, pts: [{ x: 166, y: 212 }, { x: 166, y: 378 }] },
  { id: "pfront", foot: true, hw: 10, pts: [{ x: 8, y: 378 }, { x: 166, y: 378 }, { x: 334, y: 380 }] },
  // 물가 길 (왼쪽·오른쪽 둑) — 웅덩이 둑에서 시작해 통나무 다리까지
  { id: "bankL", foot: true, hw: 16, pts: [{ x: PL.x - PL.rx - 14, y: PL.y + 10 }, { x: PL.x - 130, y: PL.y + 66 }, ...bankPath(-1, 372, 712, 52)] },
  { id: "bankR", foot: true, hw: 16, pts: [{ x: PL.x + PL.rx + 14, y: PL.y + 10 }, { x: PL.x + 130, y: PL.y + 66 }, ...bankPath(1, 372, 712, 52)] },
  // 웅덩이 앞 둑길 → 폭포 다리
  { id: "rimL", hw: 16, pts: [{ x: PL.x - 130, y: PL.y + 66 }, { x: PL.x - 70, y: VIEW_BRIDGE.y }, { x: PL.x - 30, y: VIEW_BRIDGE.y }] },
  { id: "rimR", hw: 16, pts: [{ x: PL.x + 130, y: PL.y + 66 }, { x: PL.x + 70, y: VIEW_BRIDGE.y }, { x: PL.x + 30, y: VIEW_BRIDGE.y }] },
  // 카라반 골목 (앞줄과 뒷줄 사이)
  { id: "alleyL", foot: true, hw: 16, pts: [{ x: PL.x - PL.rx - 14, y: PL.y + 10 }, ...alley(-1, 330, 640), { x: streamX(664) - 160, y: 690 }, { x: 520, y: 722 }] },
  { id: "alleyR", foot: true, hw: 16, pts: [{ x: PL.x + PL.rx + 14, y: PL.y + 10 }, ...alley(1, 330, 640), { x: streamX(664) + 170, y: 690 }, { x: 900, y: 716 }] },
  // 징검다리 가로질러 (왼쪽 골목 ↔ 오른쪽 골목)
  { id: "stones", foot: true, hw: 16, pts: [{ x: streamX(STONES_Y) - 183, y: STONES_Y }, { x: streamX(STONES_Y) - 40, y: STONES_Y }] },
  { id: "stones2", foot: true, hw: 16, pts: [{ x: streamX(STONES_Y) + 40, y: STONES_Y }, { x: streamX(STONES_Y) + 183, y: STONES_Y }] },
  // 펜션 쪽문 → 웅덩이 왼쪽 둑
  { id: "west", hw: 16, pts: [{ x: SIDE_GATE.x, y: SIDE_GATE.y }, { x: 452, y: 250 }, { x: PL.x - PL.rx - 14, y: PL.y + 10 }] },
  // 웅덩이 오른쪽 둑 → 저수지 서쪽 둑길
  { id: "east", hw: 16, pts: [{ x: PL.x + PL.rx + 14, y: PL.y + 10 }, { x: 890, y: 292 }, { x: RES.x0 - RING, y: 292 }] },
  // 저수지 둘레 둑길 (네모 한 바퀴, 폭 2칸)
  {
    id: "ring",
    hw: 16,
    pts: [
      { x: RES.x0 - RING, y: RES.y0 - RING },
      { x: RES.x1 + RING, y: RES.y0 - RING },
      { x: RES.x1 + RING, y: RES.y1 + RING },
      { x: RES.x0 - RING, y: RES.y1 + RING },
      { x: RES.x0 - RING, y: RES.y0 - RING },
    ],
  },
  // 저수지 남서쪽 → 캠프파이어 존 (물가 길로 이어진다)
  { id: "pondW", hw: 16, pts: [{ x: RES.x0 - RING, y: RES.y1 + RING }, { x: 1000, y: 530 }, { x: FIRE.x - 52, y: FIRE.y - 60 }] },
  // 캠프파이어 존 안: 광장 ↔ 불멍 자리 둘 · 간식 수레
  { id: "pits", foot: true, hw: 14, pts: [{ x: PITS[0].x + 20, y: PITS[0].y + 10 }, { x: 1030, y: 640 }, { x: 1022, y: 672 }, { x: 1010, y: 720 }, { x: PITS[1].x + 24, y: PITS[1].y }] },
  { id: "snack", foot: true, hw: 14, pts: [{ x: FIRE.x + 70, y: FIRE.y + 66 }, { x: SNACK.x - 20, y: SNACK.y + 4 }] },
];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}
type Seg = { a: Pt; b: Pt; hw: number; foot: boolean; x0: number; y0: number; x1: number; y1: number };
const SEGS: Seg[] = PATHS.flatMap((p) =>
  p.pts.slice(1).map((b, i) => {
    const a = p.pts[i];
    return { a, b, hw: p.hw, foot: !!p.foot, x0: Math.min(a.x, b.x) - p.hw - 4, y0: Math.min(a.y, b.y) - p.hw - 4, x1: Math.max(a.x, b.x) + p.hw + 4, y1: Math.max(a.y, b.y) + p.hw + 4 };
  }),
);
/** 길 가장자리까지 거리. which: 흙길만(main)·눈 다진 오솔길만(foot)·둘 다 */
export function pathEdgeDist(x: number, y: number, pad = 0, which: "all" | "main" | "foot" = "all"): number {
  let best = 1e9;
  for (const s of SEGS) {
    if (which === "main" && s.foot) continue;
    if (which === "foot" && !s.foot) continue;
    if (x < s.x0 - pad || x > s.x1 + pad || y < s.y0 - pad || y > s.y1 + pad) continue;
    const d = segDist(x, y, s.a, s.b) - s.hw;
    if (d < best) best = d;
  }
  return best;
}

// ── 바닥 종류 ──
export type MockGround = "grass" | "path" | "foot" | "plaza" | "road" | "water" | "pool" | "bank" | "rock" | "pad" | "cliff" | "river" | "pond" | "brook" | "embank";
export function groundKind(x: number, y: number): MockGround {
  const wob = (hashU(x >> 2, y >> 2, 7) - 0.5) * 3;
  if (inCliffFace(x, y)) return "cliff";
  if (onPlateau(x, y)) {
    if (Math.abs(x - upperRiverX(y)) <= UPPER_RIVER_HW) return "river";
    if (Math.abs(x - upperRiverX(y)) <= UPPER_RIVER_HW + 5 + wob) return "bank";
    return "grass";
  }
  const pd = poolD(x, y);
  if (pd <= 1) return "pool";
  if (y > 300 && Math.abs(x - streamX(y)) <= STREAM_HW) return "water";
  if (pd <= 1.07 + wob * 0.01 || (y > 300 && Math.abs(x - streamX(y)) <= STREAM_HW + 6 + wob)) return "bank";
  // 절벽 밑 돌무더기 띠
  if (x > CLIFF_X0 && x < CLIFF_X1 && y < cliffBase(x) + 8 + wob) return "rock";
  if (inRect(ROAD, x, y) && y >= ROAD.y + 2 + wob * 0.5) {
    const ex = ROAD.x + ROAD.w - 28;
    if (x <= ex) return "road";
    const dx = (x - ex) / 28;
    const dy = (y - (ROAD.y + ROAD.h / 2)) / (ROAD.h / 2);
    if (dx * dx + dy * dy <= 1) return "road";
  }
  const re = resEdge(x, y);
  if (re <= 0) return "pond";
  if (re <= EMBANK && !(x < RES.x0 && Math.abs(y - PIER.y) <= PIER.w / 2)) return "embank";
  for (const p of PITS) if (Math.hypot(x - p.x, (y - p.y - 4) * 1.25) <= 26 + wob) return "plaza";
  if (Math.hypot(x - FIRE.x, (y - FIRE.y) * 1.12) <= PLAZA_R + wob) return "plaza";
  if (Math.hypot(x - SMALL_FIRE.x, (y - SMALL_FIRE.y - 6) * 1.25) <= 30 + wob) return "plaza";
  if (inSite(x, y, -1)) return "pad";
  if (pathEdgeDist(x, y, 0, "main") <= wob * 0.6) return "path";
  if (pathEdgeDist(x, y, 0, "foot") <= wob * 0.6) return "foot";
  return "grass";
}

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

// ── 낚시 자리 (시안 표시용) ── 웅덩이 앞 둑 4 + 계곡 둑 8
export const FISH_SPOTS: readonly (Pt & { facing: "up" | "left" | "right" })[] = [
  ...POOL_ROCKS.map((r) => ({ x: r.x + r.side * 4, y: r.y - 8, facing: (r.side < 0 ? "right" : "left") as "right" | "left" })),
  ...[452, 548, 640, 690].map((y, i) => ({ x: Math.round(streamX(y) - 34), y, facing: "right" as const, i })),
  ...[420, 520, 620, 690].map((y, i) => ({ x: Math.round(streamX(y) + 34), y, facing: "left" as const, i })),
];

// ── 나무 (시드 고정, 길·물·자리·시설을 피해서) ──
export type TreeKind = "spruce" | "pine" | "fir" | "maple" | "mapleO" | "yellow" | "bush";
export type MockTree = { kind: TreeKind; x: number; y: number; v: number };
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function keepClear(x: number, y: number): boolean {
  if (pathEdgeDist(x, y, 20) < 12) return true;
  if (y > 300 && Math.abs(x - streamX(y)) < STREAM_HW + 16) return true;
  if (poolD(x, y) < 1.16) return true;
  // 절벽 면과 밑동 (나무는 마루 위나 밑동 앞 땅에만)
  if (x > CLIFF_X0 - 6 && x < CLIFF_X1 + 6 && y > cliffTop(x) - 6 && y < cliffBase(x) + 16) return true;
  // 위 마루 강
  if (onPlateau(x, y) && Math.abs(x - upperRiverX(y)) < UPPER_RIVER_HW + 12) return true;
  if (Math.hypot(x - FIRE.x, (y - FIRE.y) * 1.1) < PLAZA_R + 24) return true;
  if (inRect(OFFICE_RECT, x, y, 22)) return true;
  if (x < 330 && y > BUS_STOP.y - 64 && y < ROAD.y + ROAD.h + 40) return true;
  if (x >= 290 && x < 560 && y > 660) return true;
  if (inRect(BBQ.area, x, y, 14)) return true;
  if (resEdge(x, y) < RING + 22) return true;
  // 마을: 집 발자국 (나무 줄기가 발자국 아래 34px 안이면 우듬지가 마당을 가린다) · 놀이터 · 바베큐 마당
  if (inHome(x, y, 10, 4, 34)) return true;
  if (x > PGARDEN.x0 - 4 && x < PGARDEN.x1 + 4 && y > PGARDEN.y0 - 30 && y < PGARDEN.y1 + 6) return true;
  if (x >= 350 && x < 446 && y > 56 && y < 300) return true;
  if (x >= 340 && x < 460 && y > 56 && y < 214) return true;
  if (Math.hypot(x - BOOTH.x, y - BOOTH.y) < 34 || Math.hypot(x - POND_SIGN.x, y - POND_SIGN.y) < 20) return true;
  for (const p of PITS) if (Math.hypot(x - p.x, y - p.y) < 50) return true;
  if (x < 330 && y > 200 && y < 620 && x > -10 && y > 560 && x < 100) return true;
  if (Math.hypot(x - SNACK.x, y - SNACK.y) < 30) return true;
  for (const w of WOOD_STACKS) if (Math.hypot(x - w.x, y - w.y) < 18) return true;
  if (Math.hypot(x - PENSION_GATE.x, y - PENSION_GATE.y) < 36) return true;
  if (Math.hypot(x - PENSION_HOST.x, y - PENSION_HOST.y) < 40) return true;
  if (Math.hypot(x - PENSION_SALE_SIGN.x, y - PENSION_SALE_SIGN.y) < 22) return true;
  for (const f of POND_SPOTS) if (Math.hypot(x - f.x, y - f.y) < 20) return true;
  for (const s of SITES) if (Math.abs(x - s.x) < SITE_W / 2 + 12 && y > s.y - SITE_H / 2 - 4 && y < s.y + SITE_H / 2 + 26) return true;
  for (const f of FISH_SPOTS) if (Math.hypot(x - f.x, y - f.y) < 20) return true;
  if (Math.hypot(x - SALE_BOARD.x, y - SALE_BOARD.y) < 26) return true;
  if (Math.hypot(x - SMALL_FIRE.x, y - SMALL_FIRE.y) < 40) return true;
  if (Math.hypot(x - BOARD_SPOT.x, y - BOARD_SPOT.y) < 26) return true;
  if (x > VENDING_ROW[0].x - 24 && x < VENDING_ROW[2].x + 22 && y > VENDING_ROW[0].y - 44 && y < VENDING_ROW[0].y + 30) return true;
  if (x > BOAT_SIGN.x - 18 && x < BOAT_SIGN.x + 18 && y > BOAT_SIGN.y - 20 && y < BOAT_SIGN.y + 30) return true;
  for (const r of POOL_ROCKS) if (Math.hypot(x - r.x, y - r.y) < 26) return true;
  for (const r of SCREE) if (Math.abs(x - r.x) < 40 && y > r.y - 34 && y < r.y + 22) return true;
  return false;
}
function treeKindFor(x: number, y: number, u: number): TreeKind {
  const nearWater = (y > 300 && Math.abs(x - streamX(y)) < 120) || poolD(x, y) < 1.6 || onPlateau(x, y);
  if (nearWater) return u < 0.38 ? "spruce" : u < 0.62 ? "fir" : u < 0.74 ? "pine" : u < 0.86 ? "yellow" : u < 0.94 ? "mapleO" : "bush";
  return u < 0.22 ? "spruce" : u < 0.34 ? "pine" : u < 0.46 ? "fir" : u < 0.64 ? "yellow" : u < 0.76 ? "maple" : u < 0.88 ? "mapleO" : "bush";
}
function buildTrees(): MockTree[] {
  const out: MockTree[] = [];
  const r = seeded(20261121);
  const step = 30;
  for (let gy = -1; gy * step < MH + step; gy++)
    for (let gx = -1; gx * step < MW + step; gx++) {
      const x = Math.round(gx * step + 8 + r() * (step - 10) + (gy % 2 ? step / 2 : 0));
      const y = Math.round(gy * step + 10 + r() * (step - 12));
      const u = r();
      const kindU = r();
      const v = Math.floor(r() * 4);
      if (x < -8 || x > MW + 8 || y < 8 || y > MH + 30) continue;
      if (keepClear(x, y)) continue;
      const border = x < 30 || x > MW - 30 || y < 56 || y > MH - 6;
      // 마루 위는 빽빽하게 (폭포를 감싸는 숲), 카라반 사이는 드문드문 (자리마다 사이 나무)
      const between = SITES.some((s) => Math.abs(x - s.x) < SITE_W && Math.abs(y - s.y) < SITE_H);
      // 숲 구역은 두지 않는다 — 가장자리·마루만 빽빽하고, 안쪽은 드문드문 (자리 사이 몇 그루)
      const edge = x < 46 || x > MW - 40 || y < 70 || y > MH - 40;
      const p = border || edge || onPlateau(x, y) ? 1 : between ? 0.35 : 0.38;
      if (u > p) continue;
      out.push({ kind: treeKindFor(x, y, kindU), x, y, v });
    }
  return out;
}
export const TREES: readonly MockTree[] = buildTrees();

/** 웅덩이 둘레·절벽 밑 바위 (눈 얹은 큰 바위) */
export const ROCKS: readonly (Pt & { v: number; s: number })[] = (() => {
  const out: (Pt & { v: number; s: number })[] = [];
  const r = seeded(4401);
  // 웅덩이 둘레 (앞쪽 둑길·다리 자리는 비운다)
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.02 + (i / 26) * 0.96) + (r() - 0.5) * 0.08;
    const back = Math.sin(a) < 0;
    const k = 1.04 + r() * 0.06;
    const x = Math.round(POOL.x + Math.cos(a + Math.PI) * POOL.rx * k);
    const y = Math.round(POOL.y - Math.sin(a) * POOL.ry * k * (back ? 1 : 1));
    out.push({ x, y, v: i % 2, s: 0.6 + r() * 0.5 });
  }
  // 앞쪽 둑 (낚시 자리·길 사이)
  for (const a of [0.18, 0.3, 0.7, 0.82]) {
    const ang = Math.PI * (1 + a);
    out.push({ x: Math.round(POOL.x + Math.cos(ang) * POOL.rx * 1.05), y: Math.round(POOL.y - Math.sin(ang) * POOL.ry * 1.06), v: 1, s: 0.55 });
  }
  return out.filter((p) => pathEdgeDist(p.x, p.y) > 4 && !FISH_SPOTS.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < 14) && !POOL_ROCKS.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < 22) && !(p.x > 818 && p.x < 912 && p.y > 220 && p.y < 278));
})();

/** 밤 빛 (캠핑장 CampLight와 같은 꼴) */
export type MockLight = { x: number; y: number; scale: number; tint: number; base: number };

/** 길가 등 기둥 (물가 오솔길·골목·폭포 다리 앞) */
export const LAMPS: readonly Pt[] = [
  ...[420, 520, 620].map((y) => ({ x: Math.round(streamX(y) - 78), y })),
  ...[470, 570, 670].map((y) => ({ x: Math.round(streamX(y) + 78), y })),
  { x: 498, y: 356 },
  { x: POOL.x + 112, y: POOL.y + 84 },
  { x: 466, y: 240 },
  { x: RES.x0 - RING - 22, y: 360 },
  { x: RES.x0 - RING - 22, y: 130 },
  { x: RES.x1 + RING + 20, y: 260 },
  { x: 1040, y: 530 },
  { x: 352, y: 470 },
  { x: 160, y: 192 },
  { x: 16, y: 392 },
];

/** 바닥 소품 (나무 밑 낙엽 무더기·버섯·고사리, 물가 자갈 — 겨울 판은 campSkin이 눈 더미로 바꾼다) */
export type MockDecor = { kind: "leafPile" | "mushroom" | "fern" | "pebbles"; x: number; y: number; v: number };
export const DECOR: readonly MockDecor[] = (() => {
  const out: MockDecor[] = [];
  const r = seeded(77121);
  for (const t of TREES) {
    if (r() > 0.4) continue;
    const kind = t.kind === "spruce" || t.kind === "fir" ? (r() < 0.5 ? "fern" : "mushroom") : "leafPile";
    const x = Math.round(t.x + (r() - 0.5) * 22);
    const y = Math.round(t.y + 4 + r() * 8);
    if (pathEdgeDist(x, y) < 4 || keepClear(x, y) || inCliffFace(x, y)) continue;
    out.push({ kind, x, y, v: Math.floor(r() * 3) });
  }
  for (let y = 360; y < MH; y += 46) {
    const side = Math.floor(y / 46) % 2 ? 1 : -1;
    const x = Math.round(streamX(y) + side * (STREAM_HW + 9));
    if (Math.abs(y - VIEW_BRIDGE.y) < 26 || Math.abs(y - STONES_Y) < 16 || Math.abs(y - LOG_BRIDGE_Y) < 22) continue;
    out.push({ kind: "pebbles", x, y, v: Math.floor(r() * 3) });
  }
  return out;
})();
