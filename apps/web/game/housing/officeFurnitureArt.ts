import { Grid, lighten, mix, type Color } from "../sprites/pixel";

// 11/20 시안: 「총무팀 문대리」(야근 빌딩 옆 사무실 가구 카트)에서 팔 사무실 가구 15종 그림. 아직 카탈로그·상점에 붙이지 않았어요.
// 붙일 때는 바닷가·시즌 세트처럼 art.ts의 DRAW·SPIN_ART·UP에 펼쳐 넣고, 테는 OFFICE_EDGE로 두르면 돼요.
//  - 그림 크기 = (칸 w×16) × (칸 h×16 + 솟는 높이 OFFICE_UP). 아래 h×16이 차지 칸이에요 (furnitureGrid와 같은 규칙).
//  - 모두 4방향 가구(spin): 앞(DRAW) · 왼쪽을 봄(SPIN.side, 가로·세로 칸이 바뀐다) · 뒤(SPIN.back). 오른쪽은 옆모습을 뒤집어 써요.
//  - 빛나는 물건(야근 스탠드)은 처음부터 켜진 그림이고 변형 "off"가 꺼진 모습이에요 (석등·촛대와 같은 규칙).
//  - E로 해 보는 동작은 잠깐 바뀌는 변형 이름으로 그려요 ("memo"·"copy"·"glug"·"open"·"six"·"stamp"·"less"·"buzz"·"press"·"water"·"sway"·"meet").
//  - 이파리 햇빛가리개는 낮에 바닥에 잎 그림자를 드리워요: 테를 두른 다음 OFFICE_AFTER_EDGE로 얹고, 밤 변형 "n"이면 그리지 않아요.
//  - 명암은 시즌 세트처럼 색 단계(ramp) + 4×4 순서 디더, 빛은 늘 왼쪽 위에서 와요. 글씨는 넣지 않아요.
// 순수 함수(Grid)라 Phaser 없이 그려 볼 수 있어요.

type Draw = (g: Grid, W: number, H: number, v: string) => void;
type SpinArt = { side: Draw; back: Draw };

/** 사무실 가구 테 (차가운 먹색, 기존 가구 테와 같은 진하기) */
export const OFFICE_EDGE = 0x1e2026;
export const OFFICE_EDGE_A = 170;

const rp = (...a: string[]): readonly Color[] => a.map((h) => parseInt(h.slice(1), 16));
/** 색 단계 (밝음 → 어두움) */
const ALU = rp("#f4f6f9", "#d6dbe2", "#b2bac5", "#8c95a2", "#666e7a");
const FELT = rp("#b8c8d6", "#9cb0c2", "#8298ae", "#687f96", "#526880");
const FELT_BK = rp("#a4b4c2", "#8a9cae", "#72869a", "#5c7086");
const MESH = rp("#727684", "#545866", "#3e414c", "#2c2e37", "#1f2027");
const NAVY = rp("#8ea0d0", "#6276b0", "#465a92", "#33446f", "#253252");
const TEAL = rp("#a6e2da", "#6cc4bc", "#45a49e", "#30827e", "#22625f");
const CREAM = rp("#fffcf4", "#f4ecdc", "#e2d6be", "#c8b898", "#a8977a");
const WALNUT = rp("#c08a5e", "#9a6842", "#7a4e30", "#5a3620", "#3e2414");
const LEAF = rp("#b4e690", "#80c862", "#58a84a", "#3c8a3c", "#286a30", "#1c4e26");
const LEAF_UNDER = rp("#cfe6b4", "#a8cf8c", "#84b06c", "#668e54");
const RUBBER = rp("#8ccc94", "#56a466", "#368350", "#22663c", "#16482a");
const PAPER = rp("#ffffff", "#f6f4ec", "#e6e1d2", "#cfc7b2");
const RED = rp("#ff9a8a", "#ec5a4c", "#c63c38", "#962a2c");
const WATER = rp("#e4f6ff", "#b4e0f8", "#84c4ec", "#5aa2d6", "#3e80b8");
const CERAMIC = rp("#ffffff", "#f0eee8", "#d8d4ca", "#b8b2a6");
const GREENLAMP = rp("#a4ecb4", "#5cc47e", "#349a58", "#22743e");
const BRASS = rp("#fff0b8", "#f0cc6c", "#cc9c3e", "#9a7024");
const GOLD = rp("#fff4bc", "#f6d676", "#deae48", "#b6862e");
const STEEL = rp("#9aa2ae", "#787f8c", "#5a606c", "#41464f", "#2c3036");
const HAZARD_Y = 0xf2c230;
const INK = 0x24222a;
/** 포스트잇 (노랑·분홍·민트·주황) */
const NOTE: readonly (readonly [Color, Color])[] = [
  [0xffe680, 0xe8c44a],
  [0xffb8ca, 0xe88aa6],
  [0xb8f0d4, 0x7ccfaa],
  [0xffc488, 0xe8964a],
];

const B4M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 단계 고르기 (v 0 밝음 ~ 1 어두움, 단계 사이는 4×4 순서 디더) */
function pick(ramp: readonly Color[], v: number, x: number, y: number): Color {
  const n = ramp.length - 1;
  const f = Math.max(0, Math.min(n, v * n));
  const i = Math.floor(f);
  return ramp[Math.min(n, i + (f - i > B4M[((y & 3) << 2) | (x & 3)] ? 1 : 0))];
}
/** 사각형을 위 → 아래로 v0 → v1 */
function shade(g: Grid, x: number, y: number, w: number, h: number, ramp: readonly Color[], v0: number, v1: number): void {
  for (let j = 0; j < h; j++) {
    const v = h <= 1 ? v0 : v0 + ((v1 - v0) * j) / (h - 1);
    for (let i = 0; i < w; i++) g.set(x + i, y + j, pick(ramp, v, x + i, y + j));
  }
}
/** 사각형을 왼쪽 → 오른쪽으로 v0 → v1 (기둥·옆판) */
function shadeX(g: Grid, x: number, y: number, w: number, h: number, ramp: readonly Color[], v0: number, v1: number): void {
  for (let i = 0; i < w; i++) {
    const v = w <= 1 ? v0 : v0 + ((v1 - v0) * i) / (w - 1);
    for (let j = 0; j < h; j++) g.set(x + i, y + j, pick(ramp, v, x + i, y + j));
  }
}
/** 타원을 왼쪽 위 빛으로 칠한다 */
function orb(g: Grid, cx: number, cy: number, rx: number, ry: number, ramp: readonly Color[], base = 0.35, span = 0.55): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / Math.max(0.5, rx);
      const dy = (y + 0.5 - cy) / Math.max(0.5, ry);
      if (dx * dx + dy * dy > 1) continue;
      g.set(x, y, pick(ramp, base + span * ((dx + dy) / 2.6 + 0.2), x, y));
    }
}
/** 포스트잇 한 장 (3×3, 아래 오른쪽 귀가 살짝 들림) */
function note(g: Grid, x: number, y: number, k: number): void {
  const [c, lo] = NOTE[k % NOTE.length];
  g.rect(x, y, 3, 3, c);
  g.set(x + 2, y + 2, lo);
  g.set(x, y, lighten(c, 0.35));
}
const has = (v: string, part: string) => v.split("-").includes(part);
/** 변형에 조각 하나 더하기 */
const tok = (v: string, t: string) => [v, t].filter(Boolean).join("-");
/** 앞모습을 좌우로 뒤집어 그리는 뒷모습 (t = 덧붙일 변형 조각) */
const flipOf = (id: string, t = ""): Draw => (g, W, H, v) => {
  const tmp = new Grid(W, H);
  OFFICE_DRAW[id](tmp, W, H, tok(v, t));
  g.draw(tmp.mirrored(), 0, 0);
};
const hash = (x: number, y: number, s: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ── 솟는 높이 (px) ──
export const OFFICE_UP: Record<string, number> = {
  partition: 16,
  leaf_shade: 22,
  swivel_chair: 10,
  copier: 12,
  water_cooler: 16,
  file_cabinet: 14,
  meeting_table: 4,
  rubber_tree: 20,
  quit_clock: 14,
  approval_tray: 10,
  paper_pile: 16,
  boss_desk: 8,
  banker_lamp: 10,
  massage_chair: 12,
  leave_button: 8,
};

// ── 그림 조각 ──

/** 파티션 알루미늄 테 (위 덮개·양옆 기둥·아래 걸레받이·발 둘). 천은 따로 */
function partitionFrame(g: Grid, W: number, H: number): void {
  const top = H - 24;
  g.hline(0, W - 1, top, ALU[0]);
  g.hline(0, W - 1, top + 1, ALU[2]);
  for (let y = top; y <= H - 4; y++) {
    g.set(0, y, ALU[1]);
    g.set(1, y, ALU[3]);
    g.set(W - 2, y, ALU[1]);
    g.set(W - 1, y, ALU[3]);
  }
  g.hline(0, W - 1, H - 4, ALU[3]);
  g.hline(0, W - 1, H - 3, ALU[4]);
  // 발 (양끝, 바닥에 닿는 넓적한 받침)
  for (const x of [0, W - 3]) {
    g.hline(x, x + 2, H - 2, STEEL[2]);
    g.hline(x, x + 2, H - 1, STEEL[3]);
  }
}

/**
 * 몬스테라 잎 차양 한 장 (cx, cy 가운데, rx·ry 반지름 — 위에서 비스듬히 내려다본 넓은 하트 잎).
 * 가장자리에서 잎맥 쪽으로 파인 틈은 비워 둬서 테를 두르면 짙은 선으로 보이고, 아래 가장자리엔 잎 두께(뒷면) 한 줄.
 * ramp = 윗면(LEAF)·뒷면(LEAF_UNDER), flip = 잎끝이 왼쪽으로 휜다
 */
function monstera(g: Grid, cx: number, cy: number, rx: number, ry: number, ramp: readonly Color[], flip = false, rim = true): void {
  const inLeaf = (x: number, y: number) => {
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    const d = Math.hypot(nx, ny);
    if (d > 1) return -1;
    // 아래 가운데 하트 홈 (잎자루 자리)
    if (ny > 0.62 && Math.abs(nx) < (ny - 0.62) * 1.1) return -1;
    return d;
  };
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = inLeaf(x, y);
      if (d < 0) continue;
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const v = 0.12 + ((nx * (flip ? -1 : 1) + ny) / 2 + 0.5) * 0.5 + d * 0.12;
      g.set(x, y, pick(ramp, v, x, y));
    }
  // 잎 두께 (아래 가장자리 한 줄 짙게)
  if (rim)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.ceil(cy + ry); y >= Math.floor(cy); y--)
        if (inLeaf(x, y) >= 0) {
          g.set(x, y, ramp[ramp.length - 1]);
          break;
        }
  // 가운데 잎맥 (하트 홈 → 잎끝, 살짝 휜다)
  for (let t = 0; t <= 1; t += 0.05) {
    const x = Math.round(cx - 0.5 + (flip ? -1 : 1) * Math.sin(t * 1.4) * 1.2);
    const y = Math.round(cy + ry * 0.5 - t * ry * 1.35);
    if (g.filled(x, y)) g.set(x, y, lighten(ramp[1], 0.35));
  }
  // 파인 틈: 가장자리에서 잎맥 쪽으로 쐐기처럼 (바깥은 넓어 배경이 비치고, 안쪽은 가는 선) + 잎맥 옆 작은 구멍
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (!g.filled(x, y)) continue;
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.hypot(nx, ny);
      if (d > 1.05) continue;
      const th = Math.atan2(Math.abs(nx), -ny); // 잎맥(위) 0 ~ 아래 π
      let cut = false;
      for (const a0 of [0.75, 1.3, 1.85, 2.4]) {
        const a1 = a0 - (d - 0.5) * 0.5; // 바깥으로 갈수록 잎끝 쪽으로 휜다
        const half = d < 0.5 ? -1 : 0.04 + (d - 0.5) * 0.34;
        if (Math.abs(th - a1) < half) cut = true;
      }
      // 구멍 (틈 사이 안쪽, 잎맥 가까이)
      for (const a0 of [1.05, 1.6, 2.15]) if (d > 0.3 && d < 0.42 && Math.abs(th - a0) < 0.1) cut = true;
      if (cut) g.set(x, y, 0, 0);
    }
}

/** 은행원 스탠드 (놋 받침·기둥 + 초록 유리 갓). x0 = 갓 왼쪽, by = 받침 바닥. 켜졌으면 갓 밑 불빛 */
function bankerLampArt(g: Grid, x0: number, by: number, lit: boolean, side = false): void {
  const w = side ? 6 : 10;
  const cx = x0 + Math.floor(w / 2);
  // 받침
  g.hline(cx - 3, cx + 2, by, BRASS[3]);
  g.hline(cx - 2, cx + 1, by - 1, BRASS[1]);
  g.set(cx - 2, by - 1, BRASS[0]);
  // 기둥 + 당김 줄
  g.vline(cx, by - 5, by - 2, BRASS[2]);
  g.set(cx - 1, by - 4, BRASS[1]);
  g.vline(cx + 2, by - 5, by - 4, BRASS[3]);
  g.set(cx + 2, by - 3, BRASS[0]);
  // 갓 (반원통): 위 두 줄 둥글게 + 아래 놋 테
  const sy = by - 9;
  if (side) {
    // 옆에서 본 갓: 반원 옆모습
    g.hline(cx - 1, cx + 1, sy, GREENLAMP[1]);
    g.hline(cx - 2, cx + 2, sy + 1, GREENLAMP[2]);
    g.set(cx - 1, sy + 1, GREENLAMP[0]);
    g.hline(cx - 3, cx + 3, sy + 2, GREENLAMP[3]);
    g.hline(cx - 3, cx + 3, sy + 3, BRASS[2]);
  } else {
    shade(g, x0 + 1, sy, w - 2, 1, GREENLAMP, 0.0, 0.0);
    shade(g, x0, sy + 1, w, 2, GREENLAMP, 0.3, 0.75);
    g.set(x0 + 2, sy + 1, GREENLAMP[0]);
    g.hline(x0, x0 + w - 1, sy + 3, BRASS[2]);
    g.set(x0, sy + 3, BRASS[1]);
  }
  if (lit) {
    g.hline(cx - 2, cx + 2, sy + 4, 0xfff4c8);
    g.set(cx - 3, sy + 4, 0xffd87a);
    g.set(cx + 3, sy + 4, 0xffd87a);
  } else g.hline(cx - 2, cx + 2, sy + 4, 0x6a6448);
}

// ── 앞모습 ──
export const OFFICE_DRAW: Record<string, Draw> = {
  /** 파티션: 푸른 회색 펠트 천 + 알루미늄 테, 포스트잇·핀 꽂은 메모. 옆에 이어 놓으면 기둥끼리 맞붙는다 */
  partition: (g, W, H, v) => {
    const top = H - 24;
    // 천 (펠트 결: 세로로 아주 옅은 줄)
    for (let y = top + 2; y <= H - 5; y++)
      for (let x = 2; x <= W - 3; x++) g.set(x, y, pick(FELT, 0.18 + ((y - top) / 22) * 0.4 + (x > W - 6 ? 0.08 : 0) + (x % 3 === 0 ? 0.04 : 0), x, y));
    partitionFrame(g, W, H);
    // 메모 (핀으로 꽂은 흰 종이 + 줄 둘)
    g.rect(9, top + 3, 4, 5, PAPER[0]);
    g.hline(9, 11, top + 5, PAPER[3]);
    g.hline(9, 12, top + 6, PAPER[3]);
    g.set(12, top + 7, PAPER[2]);
    g.set(10, top + 3, RED[1]); // 압정
    // 포스트잇
    note(g, 3, top + 4, 0);
    note(g, 6, top + 10, 1);
    note(g, 3, top + 14, 2);
    // 사진 한 장 (하늘·풀 — 글씨 없이)
    g.rect(10, top + 11, 3, 3, 0x9cd0f0);
    g.hline(10, 12, top + 13, 0x7ab86a);
    if (has(v, "memo")) {
      // 방금 붙인 주황 포스트잇 + 반짝
      note(g, 9, top + 16, 3);
      g.set(13, top + 15, 0xffffff);
      g.set(8, top + 19, 0xffffff);
    }
  },

  /** 이파리 햇빛가리개: 큰 몬스테라 잎 한 장을 세운 가리개 (잎자루 기둥 + 초록 사기 받침). 창가에 두면 바닥에 잎 그림자 */
  leaf_shade: (g, W, H, v) => {
    const sway = has(v, "sway") ? 1 : 0;
    // 받침 (무거운 사기 원판)
    orb(g, W / 2, H - 2.5, 4.6, 1.8, rp("#7ab894", "#4e8a6a", "#386c52", "#28503c"), 0.1, 0.7);
    // 잎자루 기둥 (초록 줄기 + 마디)
    shadeX(g, 7, 22, 2, H - 24, LEAF, 0.45, 0.85);
    g.set(7, 28, LEAF[1]);
    // 잎 (위가 잎끝, 아래 하트 홈에 잎자루) — 흔들면 위쪽이 한 칸 기운다
    const leaf = new Grid(W, H);
    monstera(leaf, 8, 12, 7.7, 11.2, LEAF);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = leaf.px[y * W + x];
        if (!(c & 255)) continue;
        const dx = sway && y < 9 ? 1 : 0;
        if (x + dx < W) g.px[y * W + x + dx] = c;
      }
    // 잎 끝 물방울 반짝
    g.set(5 + sway, 5, 0xffffff);
  },

  /** 바퀴 달린 사무 의자: 검은 망사 등판·남색 방석·팔걸이, 가스 기둥 + 다섯 발 바퀴 */
  swivel_chair: (g, W, H) => {
    // 다섯 발 + 바퀴
    const by = H - 2;
    g.hline(3, 12, by - 1, STEEL[2]);
    g.hline(5, 10, by - 2, STEEL[1]);
    for (const x of [2, 13]) g.set(x, by - 1, STEEL[3]);
    for (const x of [1, 7, 14]) {
      g.rect(x, by, 2, 2, INK);
      g.set(x, by, 0x5a5c66);
    }
    for (const x of [4, 11]) g.set(x, by, INK);
    // 가스 기둥
    shadeX(g, 7, H - 9, 2, 6, ALU, 0.2, 0.6);
    // 방석
    orb(g, 8, H - 10.5, 6.6, 2.4, NAVY, 0.05, 0.6);
    g.hline(2, 13, H - 9, NAVY[3]);
    // 팔걸이 (기둥 + 패드)
    for (const x of [1, 13]) {
      g.rect(x, H - 15, 2, 1, MESH[1]);
      g.set(x + (x === 1 ? 1 : 0), H - 14, STEEL[2]);
      g.set(x + (x === 1 ? 1 : 0), H - 13, STEEL[2]);
    }
    // 등판 (둥근 위 + 망사 격자)
    for (let y = 1; y <= H - 13; y++)
      for (let x = 3; x <= 12; x++) {
        if (y === 1 && (x < 5 || x > 10)) continue;
        if (y === 2 && (x < 4 || x > 11)) continue;
        const frame = x === 3 || x === 12 || y === 1 || (y === 2 && (x === 4 || x === 11));
        g.set(x, y, frame ? STEEL[3] : (x + y) % 2 ? pick(MESH, 0.15 + y * 0.03, x, y) : MESH[3]);
      }
    // 허리 받침 (가로 띠)
    g.hline(4, 11, 9, MESH[0]);
    g.hline(4, 11, 10, MESH[2]);
  },

  /** 복합기: 크림 몸 + 위 자동 급지 뚜껑, 오른쪽 조작판(청록 화면·초록 단추), 왼쪽 배출 받침의 종이, 아래 용지함 둘 */
  copier: (g, W, H, v) => {
    const copy = has(v, "copy");
    // 몸
    shade(g, 1, 9, W - 2, H - 10, CREAM, 0.15, 0.55);
    shadeX(g, W - 3, 9, 2, H - 10, CREAM, 0.6, 0.8);
    // 용지함 둘 (손잡이 홈)
    for (const y of [H - 11, H - 6]) {
      g.hline(2, W - 3, y, CREAM[3]);
      g.hline(6, 9, y + 2, STEEL[3]);
    }
    // 바닥 받침
    g.hline(1, W - 2, H - 1, STEEL[3]);
    // 위: 유리판 덮개 + 자동 급지 (원고 받침)
    shade(g, 1, 5, W - 2, 4, ALU, 0.1, 0.45);
    g.hline(3, 10, 4, ALU[1]);
    g.rect(4, 3, 6, 1, PAPER[0]); // 원고
    g.set(9, 3, PAPER[2]);
    // 조작판 (오른쪽 앞, 비스듬히)
    g.rect(9, 9, 5, 3, STEEL[3]);
    g.rect(10, 10, 2, 1, copy ? 0xb8fff0 : TEAL[1]);
    g.set(13, 10, copy ? 0x9aff8a : 0x4ac46a);
    // 배출 받침 (왼쪽) + 나온 종이
    g.hline(0, 4, 14, STEEL[2]);
    g.hline(1, 4, 13, PAPER[1]);
    if (copy) {
      // 스캔 빛 (뚜껑 틈) + 방금 나온 따끈한 종이
      g.hline(2, W - 3, 8, 0xc8ffd8);
      g.rect(0, 11, 4, 2, PAPER[0]);
      g.set(1, 10, 0xffffff);
    }
  },

  /** 정수기: 거꾸로 꽂은 파란 생수통 + 흰 몸, 빨강·파랑 꼭지, 물받이, 옆 종이컵 */
  water_cooler: (g, W, H, v) => {
    const glug = has(v, "glug");
    // 생수통 (투명한 파랑, 가로 골 둘)
    for (let y = 1; y <= 12; y++) {
      const hw = y <= 2 ? 3 : 4.5;
      for (let x = Math.round(8 - hw); x < Math.round(8 + hw); x++) g.set(x, y, pick(WATER, 0.15 + ((x - 3) / 10) * 0.55 + (y < 3 ? -0.1 : 0), x, y));
    }
    for (const y of [5, 9]) g.hline(4, 11, y, WATER[3]);
    g.vline(5, 3, 11, WATER[0]); // 반짝 줄
    g.set(6, 2, 0xffffff);
    g.hline(6, 9, 13, WATER[4]); // 목
    if (glug) for (const [x, y] of [[8, 10], [9, 7], [7, 5], [9, 3]] as const) {
      g.set(x, y, 0xffffff);
      g.set(x + 1, y, WATER[0]);
    }
    // 몸 (흰 사기빛)
    shade(g, 3, 14, 10, H - 15, CERAMIC, 0.05, 0.5);
    shadeX(g, 11, 14, 2, H - 15, CERAMIC, 0.55, 0.75);
    g.hline(3, 12, 14, CERAMIC[0]);
    // 꼭지 (빨강 = 온수, 파랑 = 냉수)
    g.rect(5, 18, 2, 2, RED[1]);
    g.set(5, 18, RED[0]);
    g.rect(9, 18, 2, 2, NAVY[1]);
    g.set(9, 18, NAVY[0]);
    // 물받이
    g.rect(4, 22, 8, 2, STEEL[2]);
    g.hline(4, 11, 22, STEEL[1]);
    if (glug) {
      g.vline(9, 20, 21, WATER[1]);
      g.rect(8, 21, 3, 2, PAPER[0]); // 종이컵
    }
    // 아래 문 (통풍 줄)
    for (const y of [26, 28]) g.hline(5, 10, y, CERAMIC[3]);
    // 옆 종이컵 통
    g.rect(13, 16, 2, 6, ALU[2]);
    g.set(13, 21, PAPER[0]);
    g.set(14, 21, PAPER[1]);
  },

  /** 철제 서류 캐비닛 (4단 서랍·이름표 칸·손잡이) + 위 작은 다육이 */
  file_cabinet: (g, W, H, v) => {
    const open = has(v, "open");
    const top = H - 26;
    shade(g, 2, top, 12, 26, STEEL.map((c) => mix(c, 0xc8d0dc, 0.45)) as readonly Color[], 0.1, 0.55);
    g.hline(2, 13, top, ALU[0]);
    shadeX(g, 12, top + 1, 2, 25, STEEL, 0.2, 0.4);
    for (let i = 0; i < 4; i++) {
      const y = top + 2 + i * 6;
      if (open && i === 1) continue;
      g.hline(3, 11, y + 5, STEEL[2]); // 서랍 틈
      g.rect(6, y + 1, 4, 2, PAPER[1]); // 이름표 칸
      g.set(9, y + 2, PAPER[3]);
      g.hline(6, 9, y + 3, STEEL[3]); // 손잡이
    }
    if (open) {
      // 둘째 서랍을 빼 놓았다: 서랍 앞판이 아래로 두 칸 나오고, 위로 색 서류철 귀가 보인다
      const y = top + 8;
      g.rect(3, y, 9, 2, STEEL[4]);
      for (let x = 3; x <= 11; x++) g.set(x, y, [0xf0c050, 0x6aa6e0, 0xe86a5a, 0x7ac47a][x % 4]);
      g.rect(2, y + 2, 12, 5, mix(STEEL[1], 0xc8d0dc, 0.5));
      g.hline(2, 13, y + 2, ALU[1]);
      g.rect(6, y + 3, 4, 2, PAPER[1]);
      g.hline(6, 9, y + 5, STEEL[3]);
      g.hline(2, 13, y + 7, STEEL[3]);
    }
    // 위 다육이 (작은 테라코타 화분)
    g.rect(9, top - 3, 4, 3, 0xd07a4e);
    g.hline(9, 12, top - 3, 0xe89a6a);
    for (const [x, y] of [[10, top - 4], [11, top - 5], [12, top - 4], [10, top - 6]] as const) g.set(x, y, LEAF[2]);
    g.set(11, top - 6, LEAF[0]);
    // 발
    g.hline(2, 3, H - 1, STEEL[4]);
    g.hline(12, 13, H - 1, STEEL[4]);
  },

  /** 회의 테이블 (2×1): 흰 상판 + 은 다리 둘, 가운데 세모 회의 스피커, 생수 두 병, 노트북·수첩 */
  meeting_table: (g, W, H, v) => {
    const meet = has(v, "meet");
    // 상판 (둥근 모서리)
    for (let y = 2; y <= 11; y++)
      for (let x = 0; x < W; x++) {
        const r = y === 2 || y === 11 ? 2 : y === 3 ? 1 : 0;
        if (x < r || x > W - 1 - r) continue;
        g.set(x, y, pick(CREAM, 0.05 + ((y - 2) / 9) * 0.3 + (x / W) * 0.15, x, y));
      }
    g.hline(1, W - 2, 12, CREAM[3]);
    g.hline(2, W - 3, 13, CREAM[4]);
    // 다리 (판 다리 둘 + 발)
    for (const x of [5, W - 8]) {
      shadeX(g, x, 14, 3, H - 16, ALU, 0.15, 0.6);
      g.hline(x - 1, x + 3, H - 2, STEEL[2]);
      g.hline(x - 1, x + 3, H - 1, STEEL[3]);
    }
    // 회의 스피커 (짙은 회색 세모 + 초록 불)
    const sx = 15;
    g.hline(sx - 3, sx + 3, 8, STEEL[3]);
    g.hline(sx - 2, sx + 2, 7, STEEL[2]);
    g.hline(sx - 1, sx + 1, 6, STEEL[1]);
    g.set(sx, 7, meet ? 0x9aff8a : 0x4ac46a);
    // 생수 (파란 병뚜껑)
    for (const x of [3, W - 5]) {
      g.vline(x, 4, 8, WATER[1]);
      g.vline(x + 1, 4, 8, WATER[3]);
      g.hline(x, x + 1, 3, NAVY[2]);
      g.set(x, 6, PAPER[0]); // 상표 띠
      g.set(x + 1, 6, PAPER[2]);
    }
    // 노트북 (뚜껑 뒷면이 보인다 — 앞쪽 사람이 쓰는 중) / 회의 중이면 화면 빛이 테이블에
    g.rect(7, 3, 5, 4, ALU[2]);
    g.hline(7, 11, 3, ALU[1]);
    g.set(9, 5, ALU[0]);
    g.hline(6, 12, 7, ALU[3]);
    if (meet) g.hline(6, 12, 8, 0xd8f0ff);
    // 수첩 + 펜
    g.rect(20, 5, 4, 3, NAVY[2]);
    g.vline(20, 5, 7, NAVY[3]);
    g.set(25, 5, RED[1]);
    g.set(24, 6, RED[2]);
    if (meet) {
      // 커피 두 잔 (김)
      for (const x of [13, 18]) {
        g.rect(x, 9, 2, 2, PAPER[0]);
        g.set(x, 9, 0x6a4430);
      }
      g.set(13, 7, 0xffffff);
      g.set(19, 7, 0xffffff);
    }
  },

  /** 사무실 고무나무: 흰 사기 화분 + 윤나는 큰 잎 아홉 + 꼭대기 붉은 새순 */
  rubber_tree: (g, W, H, v) => {
    const wet = has(v, "water");
    // 화분
    for (let y = H - 8; y <= H - 1; y++) {
      const inset = y >= H - 2 ? 1 : 0;
      for (let x = 3 + inset; x <= 12 - inset; x++) g.set(x, y, pick(CERAMIC, 0.1 + ((x - 3) / 9) * 0.6, x, y));
    }
    g.hline(2, 13, H - 9, CERAMIC[0]);
    g.hline(3, 12, H - 8, wet ? 0x3a2418 : 0x5a3c26); // 흙
    // 줄기
    for (let y = 6; y <= H - 9; y++) g.set(8 + (y < 14 ? -1 : 0), y, y % 4 ? 0x7a5a3a : 0x5a4028);
    // 잎: 비스듬한 긴 타원 (반짝이는 윗변)
    const leaf = (cx: number, cy: number, dir: number, len: number) => {
      for (let i = 0; i < len; i++) {
        const x = cx + dir * i;
        const y = cy - Math.round(i * 0.35);
        const half = i === 0 || i === len - 1 ? 0 : 1;
        for (let j = -half; j <= half; j++) g.set(x, y + j, pick(RUBBER, 0.25 + j * 0.3 + (dir < 0 ? 0.05 : 0.15), x, y + j));
        if (half && i > 0 && i < len - 2) g.set(x, y - 1, RUBBER[0]);
      }
    };
    leaf(7, H - 11, -1, 5);
    leaf(9, H - 13, 1, 5);
    leaf(7, H - 16, -1, 6);
    leaf(9, H - 19, 1, 6);
    leaf(6, H - 22, -1, 5);
    leaf(8, H - 25, 1, 5);
    leaf(6, H - 28, -1, 4);
    leaf(8, 5, 1, 3);
    // 새순 (붉은 잎집)
    g.vline(7, 1, 4, RUBBER[2]);
    g.set(7, 0, 0xd06a5a);
    g.set(7, 1, 0xb84a40);
    if (wet) for (const [x, y] of [[3, H - 14], [12, H - 18], [4, H - 24], [11, H - 27]] as const) g.set(x, y, 0xdaf4ff);
  },

  /** 칼퇴 시계: 양면 역 시계 (남색 테·크림 판) + 은 기둥·둥근 받침. 늘 5시 59분, 「six」면 6시 정각 + 종소리 반짝 */
  quit_clock: (g, W, H, v) => {
    const six = has(v, "six");
    // 받침·기둥
    orb(g, 8, H - 2, 5, 1.6, STEEL, 0.1, 0.7);
    shadeX(g, 7, 13, 2, H - 15, ALU, 0.2, 0.65);
    // 판
    const cx = 8;
    const cy = 7;
    for (let y = 0; y <= 14; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - (cy + 0.5));
        if (d > 7) continue;
        g.set(x, y, d > 5.9 ? (six ? pick(GOLD, 0.2 + (y / 14) * 0.6, x, y) : pick(NAVY, 0.15 + (y / 14) * 0.6, x, y)) : pick(CREAM, 0.05 + (d / 6) * 0.25, x, y));
      }
    // 눈금 (12·3·6·9 + 사이 점)
    for (const [x, y] of [[cx, cy - 4], [cx + 4, cy], [cx, cy + 4], [cx - 4, cy]] as const) g.set(x, y, INK);
    for (const [x, y] of [[cx + 3, cy - 3], [cx + 3, cy + 3], [cx - 3, cy + 3], [cx - 3, cy - 3]] as const) g.set(x, y, CREAM[3]);
    // 바늘: 시침 6시 방향, 분침 12시(59분이면 한 칸 왼쪽 위)
    g.vline(cx, cy + 1, cy + 3, INK);
    if (six) g.vline(cx, cy - 3, cy, RED[2]);
    else {
      g.vline(cx, cy - 1, cy, RED[2]);
      g.set(cx - 1, cy - 2, RED[2]);
      g.set(cx - 1, cy - 3, RED[2]);
    }
    g.set(cx, cy, GOLD[2]);
    g.set(cx - 3, cy - 5, 0xffffff); // 유리 반짝
    if (six) {
      // 종소리 반짝 (양옆으로)
      for (const [x, y] of [[0, 3], [1, 1], [15, 3], [14, 1], [0, 11], [15, 11]] as const) g.set(x, y, 0xfff4bc);
    }
  },

  /** 결재함: 호두나무 작은 장 + 위 3단 철망 서류함(색 서류철), 오른쪽 빨간 도장과 인주 */
  approval_tray: (g, W, H, v) => {
    const stamp = has(v, "stamp");
    // 장
    shade(g, 2, H - 12, 12, 11, WALNUT, 0.15, 0.6);
    g.hline(1, 14, H - 13, WALNUT[0]);
    g.hline(1, 14, H - 12, WALNUT[1]);
    g.vline(8, H - 10, H - 3, WALNUT[3]); // 문 사이
    g.set(7, H - 7, BRASS[1]);
    g.set(9, H - 7, BRASS[1]);
    g.hline(2, 13, H - 2, WALNUT[4]);
    g.set(2, H - 1, WALNUT[4]);
    g.set(13, H - 1, WALNUT[4]);
    // 3단 서류함 (철망 테 + 종이 + 서류철)
    for (let i = 0; i < 3; i++) {
      const y = H - 14 - i * 4;
      g.hline(2, 10, y, ALU[3]);
      g.hline(2, 10, y - 1, PAPER[i === 0 ? 1 : 0]);
      g.hline(3, 9, y - 2, i === 1 ? 0xf0c050 : i === 2 ? 0x8ac4f0 : PAPER[1]);
      g.set(2, y - 1, ALU[2]);
      g.set(10, y - 1, ALU[2]);
      g.set(2, y - 2, ALU[2]);
      g.set(10, y - 2, ALU[2]);
      g.set(3, y - 2, RED[1]); // 「급」 꼬리표 (글씨 없이 색만)
    }
    g.vline(1, H - 23, H - 14, ALU[2]);
    g.vline(11, H - 23, H - 14, ALU[3]);
    // 인주 + 도장
    g.rect(11, H - 15, 3, 2, RED[3]);
    g.hline(11, 13, H - 15, RED[1]);
    if (stamp) {
      // 도장을 들어 올리고 맨 위 서류에 빨간 동그라미 자국
      g.vline(13, H - 21, H - 18, 0x8a5a36);
      g.hline(12, 14, H - 22, 0xa87444);
      g.set(13, H - 17, RED[2]);
      g.set(5, H - 25, RED[1]);
      g.set(6, H - 25, RED[1]);
      g.set(5, H - 24, RED[1]);
      g.set(6, H - 24, RED[2]);
      g.set(8, H - 26, 0xffffff);
    } else {
      g.vline(12, H - 19, H - 16, 0x8a5a36);
      g.hline(11, 13, H - 20, 0xa87444);
      g.set(12, H - 16, RED[2]);
    }
  },

  /** 서류 산더미: 기울어진 높은 더미 + 낮은 더미 (종이 결 줄·색 서류철·포스트잇 꼬리표), 맨 위 머그컵, 바닥에 구긴 종이 */
  paper_pile: (g, W, H, v) => {
    const less = has(v, "less");
    const FC = [0xe8c070, 0x7ab0e8, 0xe87a6a, 0x8ad08a];
    const stack = (x0: number, w: number, top: number, lean: number, seed: number) => {
      for (let y = top; y <= H - 2; y++) {
        const off = Math.round(((H - 2 - y) / Math.max(1, H - 2 - top)) * lean) + (hash(0, y >> 2, seed) < 0.3 ? 1 : 0);
        const first = y === top || y === top + 1;
        const folder = !first && hash(1, y, seed) < 0.2;
        const fc = FC[Math.floor(hash(2, y, seed) * 4)];
        for (let i = 0; i < w; i++) {
          const x = x0 + off + i;
          let c: Color;
          if (first) c = y === top ? PAPER[0] : PAPER[1]; // 맨 위 종이 면
          else if (folder) c = i >= w - 2 ? mix(fc, 0x000000, 0.22) : fc;
          else c = i >= w - 2 ? PAPER[3] : y % 2 ? PAPER[1] : PAPER[2];
          g.set(x, y, c);
        }
        if (!first && hash(3, y, seed) < 0.12) g.set(x0 + off + w, y, NOTE[Math.floor(hash(4, y, seed) * 3)][0]); // 꼬리표
      }
    };
    stack(1, 8, less ? 11 : 6, 2, 3);
    stack(8, 7, 16, -1, 5);
    // 높은 더미 맨 위: 검은 집게 + 포스트잇 깃발
    const ty = less ? 11 : 6;
    g.hline(3, 6, ty, INK);
    g.set(4, ty - 1, STEEL[1]);
    g.set(5, ty - 1, STEEL[1]);
    g.set(8, ty + 1, NOTE[1][0]);
    g.set(9, ty + 1, NOTE[1][1]);
    // 낮은 더미 위 머그컵 (커피 + 손잡이)
    g.rect(10, 13, 3, 3, CERAMIC[1]);
    g.vline(12, 13, 15, CERAMIC[3]);
    g.hline(10, 11, 13, 0x6a4430);
    g.set(13, 14, CERAMIC[2]);
    // 구긴 종이 공
    g.set(14, H - 2, PAPER[1]);
    g.set(15, H - 2, PAPER[3]);
    g.set(14, H - 3, PAPER[0]);
    if (less) {
      g.set(2, 4, 0xfff4bc);
      g.set(9, 7, 0xfff4bc);
    }
  },

  /** 부장님 책상 (2×1): 호두나무 큰 책상, 초록 가죽 받침, 금빛 명패(글씨 없이 점 셋), 검은 전화기·펜꽂이·결재 서류 */
  boss_desk: (g, W, H) => {
    const top = 4;
    // 윗면
    shade(g, 0, top, W, 5, WALNUT, 0.0, 0.25);
    g.hline(0, W - 1, top, WALNUT[0]);
    // 가죽 받침
    shade(g, 9, top + 1, 14, 3, rp("#8cc49a", "#62a274", "#468258", "#326240"), 0.1, 0.6);
    g.hline(9, 22, top + 1, 0xb0dcb8);
    // 앞판 (가운데 판 장식 둘 + 테)
    shade(g, 1, top + 5, W - 2, H - top - 7, WALNUT, 0.35, 0.75);
    g.hline(0, W - 1, top + 5, WALNUT[3]);
    for (const x0 of [3, 17]) {
      g.hline(x0, x0 + 11, top + 7, WALNUT[1]);
      g.vline(x0, top + 7, H - 5, WALNUT[1]);
      g.hline(x0, x0 + 11, H - 5, WALNUT[4]);
      g.vline(x0 + 11, top + 7, H - 5, WALNUT[4]);
    }
    // 받침 (걸레받이)
    g.hline(0, W - 1, H - 3, WALNUT[4]);
    g.hline(1, W - 2, H - 2, WALNUT[3]);
    g.hline(1, 3, H - 1, WALNUT[4]);
    g.hline(W - 4, W - 2, H - 1, WALNUT[4]);
    // 금빛 명패 (나무 받침 + 금판, 글씨 대신 점 셋)
    g.hline(12, 19, top + 3, WALNUT[3]);
    g.rect(12, top, 8, 3, GOLD[1]);
    g.hline(12, 19, top, GOLD[0]);
    g.vline(19, top, top + 2, GOLD[3]);
    for (const x of [14, 16, 18]) g.set(x - 1, top + 1, GOLD[3]);
    // 전화기 (검은 몸 + 수화기)
    g.rect(2, top - 2, 5, 3, MESH[2]);
    g.hline(2, 6, top - 3, MESH[1]);
    g.set(3, top - 3, MESH[0]);
    g.set(5, top - 1, 0x9aff8a);
    // 펜꽂이
    g.rect(26, top - 2, 2, 3, BRASS[2]);
    g.set(26, top - 3, RED[1]);
    g.set(27, top - 4, NAVY[1]);
    // 결재 서류 (남색 결재판)
    g.rect(22, top - 1, 3, 3, NAVY[2]);
    g.hline(22, 24, top - 1, NAVY[1]);
    g.set(23, top, PAPER[0]);
  },

  /** 야근 스탠드: 둥근 호두나무 협탁 + 초록 은행원 스탠드(켜짐) + 서류 몇 장·머그 */
  banker_lamp: (g, W, H, v) => {
    const lit = !has(v, "off");
    // 협탁
    orb(g, 8, H - 11, 7.4, 2.4, WALNUT, 0.0, 0.5);
    g.hline(1, 14, H - 9, WALNUT[3]);
    shadeX(g, 7, H - 8, 2, 6, WALNUT, 0.3, 0.7);
    g.hline(3, 12, H - 2, WALNUT[3]);
    g.hline(4, 11, H - 1, WALNUT[4]);
    if (lit) {
      // 상판에 번진 불빛
      for (let x = 4; x <= 10; x++) g.set(x, H - 12, x % 2 ? 0xe8b880 : 0xf0c890);
    }
    // 서류 + 머그
    g.rect(10, H - 13, 3, 2, PAPER[0]);
    g.set(12, H - 12, PAPER[2]);
    g.rect(2, H - 14, 2, 2, RED[1]);
    g.set(2, H - 14, RED[0]);
    bankerLampArt(g, 3, H - 12, lit);
  },

  /** 안마의자: 아이보리 쿠션 + 초콜릿 가죽 옆판, 둥근 머리 쿠션·가로 누빔 등판, 넓은 팔걸이(오른쪽 조작판), 종아리 안마 발판 */
  massage_chair: (g, W, H, v) => {
    const buzz = has(v, "buzz");
    const SIDE = WALNUT;
    // 받침
    g.hline(3, 12, H - 1, MESH[3]);
    // 발판 (갈색 틀 + 아이보리 종아리 주머니 둘)
    shade(g, 3, H - 8, 10, 7, SIDE, 0.3, 0.7);
    for (const x0 of [4, 9]) shade(g, x0, H - 7, 3, 5, CREAM, 0.1, 0.5);
    // 방석
    shade(g, 3, H - 12, 10, 4, CREAM, 0.0, 0.35);
    g.hline(3, 12, H - 9, CREAM[3]);
    // 등판 (둥근 위, 가로 누빔) + 갈색 옆 날개
    for (let y = 2; y <= H - 12; y++)
      for (let x = 2; x <= 13; x++) {
        if (y === 2 && (x < 4 || x > 11)) continue;
        if (y === 3 && (x < 3 || x > 12)) continue;
        const wing = x <= 3 || x >= 12;
        g.set(x, y, wing ? pick(SIDE, 0.2 + (x >= 12 ? 0.3 : 0) + y * 0.02, x, y) : pick(CREAM, 0.05 + ((x - 4) / 8) * 0.3 + ((y - 2) % 4 === 0 ? 0.18 : 0), x, y));
      }
    // 머리 쿠션
    orb(g, 8, 3.5, 3.6, 1.8, CREAM, 0.0, 0.45);
    // 팔걸이 (갈색 큰 덩어리, 윗면 밝게) + 오른쪽 조작판
    for (const x0 of [0, 12]) {
      shade(g, x0, H - 16, 4, 9, SIDE, 0.25, 0.75);
      g.hline(x0, x0 + 3, H - 16, SIDE[0]);
      g.hline(x0, x0 + 3, H - 15, CREAM[1]);
    }
    g.rect(13, H - 14, 2, 2, MESH[2]);
    g.set(13, H - 14, TEAL[1]);
    g.set(14, H - 13, RED[1]);
    if (buzz) {
      // 덜덜덜: 등판 줄을 한 칸씩 엇갈리게 + 옆 떨림 줄
      for (let y = 5; y <= H - 13; y += 2) {
        const row: number[] = [];
        for (let x = 2; x <= 13; x++) row.push(g.get(x, y));
        for (let x = 3; x <= 13; x++) g.px[y * W + x] = row[x - 3];
      }
      for (const [x, y] of [[0, 6], [0, 9], [15, 5], [15, 8], [1, 3], [14, 2]] as const) g.set(x, y, 0xfff4bc);
    }
  },

  /** 퇴근 버튼: 노랑·검정 경고 줄 받침 위 큰 빨간 단추, 뒤로 젖힌 투명 덮개 */
  leave_button: (g, W, H, v) => {
    const press = has(v, "press");
    // 받침 발
    g.hline(2, 13, H - 1, STEEL[4]);
    g.hline(3, 12, H - 2, STEEL[3]);
    // 기둥 (경고 줄 띠 + 철판)
    shadeX(g, 4, H - 12, 8, 8, STEEL, 0.15, 0.7);
    for (let y = H - 6; y <= H - 3; y++) for (let x = 4; x <= 11; x++) g.set(x, y, (x + y) % 4 < 2 ? HAZARD_Y : INK);
    g.set(5, H - 10, STEEL[0]); // 나사
    g.set(10, H - 10, STEEL[3]);
    // 윗판
    g.hline(3, 12, H - 13, STEEL[1]);
    g.hline(3, 12, H - 12, STEEL[3]);
    // 뒤로 젖힌 투명 덮개 (옅은 하늘빛 테만)
    for (let x = 3; x <= 12; x++) g.set(x, 2, 0xcfe8f8, 200);
    for (let y = 3; y <= 9; y++) {
      g.set(3, y, 0xcfe8f8, 170);
      g.set(12, y, 0xb0d0e8, 170);
    }
    g.set(4, 3, 0xffffff);
    // 큰 빨간 단추
    if (press) {
      orb(g, 8, H - 14, 4, 1.3, RED, 0.3, 0.6);
      for (const [x, y, c] of [[1, 4, 0xffe680], [14, 6, 0x8ad0ff], [2, 10, 0xffb8ca], [13, 1, 0xb8f0d4], [7, 0, 0xffc488], [10, 1, 0xffffff]] as const) g.set(x, y, c);
    } else {
      orb(g, 8, H - 15, 4, 2.4, RED, 0.05, 0.7);
      g.set(6, H - 17, 0xffd4cc);
      g.set(7, H - 17, 0xffffff);
    }
  },
};

/** 테를 두른 다음 얹는 그림 (테가 붙으면 안 되는 반투명 그림자). 이파리 햇빛가리개: 낮에만 바닥에 잎 그림자 */
export const OFFICE_AFTER_EDGE: Record<string, Draw> = {
  leaf_shade: (g, W, H, v) => {
    if (has(v, "n")) return;
    const sway = has(v, "sway") ? 1 : 0;
    // 잎 모양 그림자 (기둥 오른쪽 아래로 비스듬히 — 해가 왼쪽 위)
    const s = new Grid(W, H);
    monstera(s, 10 + sway, H - 6, 6.2, 4.4, [0x10, 0x10, 0x10, 0x10, 0x10], false, false);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!s.filled(x, y) || g.filled(x, y)) continue;
        g.set(x, y, 0x1e3a24, 72);
      }
  },
};

// ── 옆(왼쪽을 봄)·뒤 ──
export const OFFICE_SPIN: Record<string, SpinArt> = {
  partition: {
    // 왼쪽을 봄: 깊이 방향으로 선 얇은 판 — 위 덮개·앞 기둥이 세로로 길게, 천은 세 줄만 비스듬히 보인다
    side: (g, W, H, v) => {
      for (let y = 1; y <= H - 4; y++) {
        g.set(5, y, ALU[0]);
        for (let x = 6; x <= 9; x++) g.set(x, y, pick(FELT, 0.15 + (y / H) * 0.4 + (x - 6) * 0.06, x, y));
        g.set(10, y, ALU[3]);
      }
      g.hline(5, 10, 0, ALU[1]);
      g.hline(5, 10, 13, ALU[2]); // 판 이음 (두 칸 길이의 가운데)
      g.hline(5, 10, H - 4, ALU[3]);
      g.hline(5, 10, H - 3, ALU[4]);
      // 옆면 포스트잇
      g.rect(7, 6, 2, 2, NOTE[0][0]);
      g.set(8, 7, NOTE[0][1]);
      g.rect(6, 18, 2, 2, NOTE[2][0]);
      // 발 (앞뒤로 긴 받침)
      g.hline(4, 11, H - 2, STEEL[2]);
      g.hline(4, 11, H - 1, STEEL[3]);
      g.hline(5, 10, 13, STEEL[3]); // 뒤 발 (위쪽)
      // 판 끝에 비죽 나온 포스트잇 귀
      g.set(4, 10, NOTE[1][0]);
      g.set(4, 11, NOTE[1][1]);
      if (has(v, "memo")) {
        g.rect(7, 22, 2, 2, NOTE[3][0]);
        g.set(9, 21, 0xffffff);
      }
    },
    // 뒤: 무늬 없는 천 + 가운데 옷걸이 고리에 건 사원증
    back: (g, W, H) => {
      const top = H - 24;
      for (let y = top + 2; y <= H - 5; y++)
        for (let x = 2; x <= W - 3; x++) g.set(x, y, pick(FELT_BK, 0.25 + ((y - top) / 22) * 0.45 + (x < 5 ? 0.08 : 0), x, y));
      partitionFrame(g, W, H);
      // 고리 + 사원증 (청록 끈 V → 흰 카드)
      g.hline(7, 8, top + 2, ALU[0]);
      g.set(7, top + 3, ALU[2]);
      for (const [x, y] of [[6, top + 4], [9, top + 4], [6, top + 5], [9, top + 5], [7, top + 6], [8, top + 6]] as const) g.set(x, y, TEAL[2]);
      g.rect(6, top + 7, 4, 4, PAPER[0]);
      g.rect(6, top + 8, 2, 2, 0x8aa4c4);
      g.set(9, top + 10, PAPER[3]);
    },
  },

  leaf_shade: {
    // 왼쪽을 봄: 잎이 옆으로 서서 얇게 휜 면만 보인다 (잎맥 + 틈 끝 몇 개)
    side: (g, W, H, v) => {
      const sway = has(v, "sway") ? 1 : 0;
      orb(g, W / 2, H - 2.5, 4.6, 1.8, rp("#7ab894", "#4e8a6a", "#386c52", "#28503c"), 0.1, 0.7);
      shadeX(g, 7, 22, 2, H - 24, LEAF, 0.45, 0.85);
      for (let y = 1; y <= 22; y++) {
        const t = (y - 1) / 21;
        const bow = Math.round(Math.sin(t * Math.PI) * 2.2) - (y < 9 ? sway : 0);
        const half = Math.round(Math.sin(t * Math.PI) * 1.6 + 0.4);
        for (let k = -half; k <= half; k++) g.set(8 - bow + k, y, pick(LEAF, 0.2 + (k + half) * 0.18 + t * 0.2, 8 - bow + k, y));
        g.set(8 - bow, y, LEAF[1]);
        if (y % 5 === 2 && half > 1) g.set(8 - bow - half, y, 0, 0); // 틈 끝
      }
    },
    // 뒤: 잎 뒷면 (옅은 초록, 잎맥이 도드라진다)
    back: (g, W, H, v) => {
      const sway = has(v, "sway") ? 1 : 0;
      orb(g, W / 2, H - 2.5, 4.6, 1.8, rp("#7ab894", "#4e8a6a", "#386c52", "#28503c"), 0.2, 0.7);
      shadeX(g, 7, 22, 2, H - 24, LEAF, 0.55, 0.9);
      const leaf = new Grid(W, H);
      monstera(leaf, 8, 12, 7.7, 11.2, LEAF_UNDER, true);
      // 갈래 잎맥 (가운데에서 비스듬히 위로)
      for (const y0 of [7, 11, 15, 19])
        for (const sd of [-1, 1]) for (let i = 1; i <= 5; i++) if (leaf.filled(8 + sd * i, y0 - Math.floor(i / 2))) leaf.set(8 + sd * i, y0 - Math.floor(i / 2), LEAF_UNDER[0]);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = leaf.px[y * W + x];
          if (!(c & 255)) continue;
          const dx = sway && y < 9 ? -1 : 0;
          if (x + dx >= 0) g.px[y * W + x + dx] = c;
        }
    },
  },

  swivel_chair: {
    // 왼쪽을 봄: 등판이 오른쪽에 세로로 서고, 방석은 앞(왼쪽)으로
    side: (g, W, H) => {
      const by = H - 2;
      g.hline(3, 12, by - 1, STEEL[2]);
      for (const x of [2, 7, 12]) {
        g.rect(x, by, 2, 2, INK);
        g.set(x, by, 0x5a5c66);
      }
      shadeX(g, 7, H - 9, 2, 6, ALU, 0.2, 0.6);
      orb(g, 7, H - 10.5, 5.4, 2.2, NAVY, 0.05, 0.6);
      g.hline(2, 12, H - 9, NAVY[3]);
      // 등판 (옆에서 본 휜 판)
      for (let y = 1; y <= H - 11; y++) {
        const x = 11 + (y < 4 ? 0 : y > H - 15 ? 0 : 1);
        g.set(x, y, STEEL[3]);
        g.set(x - 1, y, (y % 2 ? MESH[1] : MESH[2]));
      }
      g.set(10, 1, STEEL[3]);
      // 팔걸이
      g.hline(4, 9, H - 15, MESH[1]);
      g.set(7, H - 14, STEEL[2]);
      g.set(7, H - 13, STEEL[2]);
    },
    // 뒤: 등판 뒷면 (회색 틀 + 망사 결) + 손잡이 레버
    back: (g, W, H) => {
      const by = H - 2;
      g.hline(3, 12, by - 1, STEEL[2]);
      for (const x of [1, 7, 14]) {
        g.rect(x, by, 2, 2, INK);
        g.set(x, by, 0x5a5c66);
      }
      shadeX(g, 7, H - 9, 2, 6, ALU, 0.3, 0.7);
      orb(g, 8, H - 10.5, 6.6, 2.4, NAVY, 0.4, 0.5);
      for (const x of [1, 13]) g.rect(x, H - 15, 2, 1, MESH[2]);
      for (let y = 1; y <= H - 12; y++)
        for (let x = 3; x <= 12; x++) {
          if (y === 1 && (x < 5 || x > 10)) continue;
          if (y === 2 && (x < 4 || x > 11)) continue;
          g.set(x, y, x === 3 || x === 12 || y <= 2 ? STEEL[3] : pick(MESH, 0.35 + (y % 2) * 0.15, x, y));
        }
      g.vline(8, 3, H - 13, STEEL[2]); // 등뼈 받침
      g.set(13, H - 9, STEEL[1]); // 높이 레버
    },
  },

  copier: {
    // 왼쪽을 봄: 좁은 몸, 조작판·용지함 앞이 왼쪽 끝에
    side: (g, W, H, v) => {
      const copy = has(v, "copy");
      shade(g, 3, 9, 10, H - 10, CREAM, 0.2, 0.6);
      shadeX(g, 3, 9, 2, H - 10, CREAM, 0.0, 0.2);
      for (const y of [H - 11, H - 6]) {
        g.hline(3, 12, y, CREAM[3]);
        g.set(2, y + 2, STEEL[3]); // 용지함 손잡이
      }
      g.hline(3, 12, H - 1, STEEL[3]);
      shade(g, 3, 5, 10, 4, ALU, 0.1, 0.45);
      g.hline(5, 11, 4, ALU[1]);
      g.rect(2, 9, 3, 3, STEEL[3]);
      g.set(2, 10, copy ? 0xb8fff0 : TEAL[1]);
      // 배출 받침은 뒤쪽(위)
      g.hline(13, 14, 14, STEEL[2]);
      g.set(13, 13, PAPER[1]);
      if (copy) g.hline(4, 12, 8, 0xc8ffd8);
    },
    // 뒤: 통풍 창살 + 전선
    back: (g, W, H) => {
      shade(g, 1, 9, W - 2, H - 10, CREAM, 0.35, 0.7);
      shade(g, 1, 5, W - 2, 4, ALU, 0.25, 0.55);
      for (let y = 12; y <= 18; y += 2) g.hline(4, 11, y, CREAM[4]);
      g.vline(12, H - 6, H - 2, INK);
      g.set(13, H - 1, INK);
      g.hline(1, W - 2, H - 1, STEEL[3]);
    },
  },

  water_cooler: {
    // 왼쪽을 봄: 꼭지가 왼쪽으로 나오고 종이컵 통은 뒤쪽(오른쪽)
    side: (g, W, H, v) => {
      const glug = has(v, "glug");
      for (let y = 1; y <= 12; y++) {
        const hw = y <= 2 ? 3 : 4.5;
        for (let x = Math.round(8 - hw); x < Math.round(8 + hw); x++) g.set(x, y, pick(WATER, 0.15 + ((x - 3) / 10) * 0.55, x, y));
      }
      for (const y of [5, 9]) g.hline(4, 11, y, WATER[3]);
      g.vline(5, 3, 11, WATER[0]);
      g.hline(6, 9, 13, WATER[4]);
      shade(g, 4, 14, 9, H - 15, CERAMIC, 0.1, 0.55);
      g.hline(4, 12, 14, CERAMIC[0]);
      g.rect(2, 18, 2, 2, NAVY[1]);
      g.rect(2, 21, 3, 2, STEEL[2]);
      if (glug) {
        g.set(2, 20, WATER[1]);
        g.rect(2, 20, 2, 1, PAPER[0]);
        g.set(8, 6, 0xffffff);
        g.set(7, 3, 0xffffff);
      }
      for (const y of [26, 28]) g.hline(6, 11, y, CERAMIC[3]);
      g.rect(13, 16, 2, 6, ALU[2]);
    },
    // 뒤: 냉각 코일 + 전선
    back: (g, W, H) => {
      for (let y = 1; y <= 12; y++) {
        const hw = y <= 2 ? 3 : 4.5;
        for (let x = Math.round(8 - hw); x < Math.round(8 + hw); x++) g.set(x, y, pick(WATER, 0.3 + ((x - 3) / 10) * 0.5, x, y));
      }
      for (const y of [5, 9]) g.hline(4, 11, y, WATER[3]);
      g.hline(6, 9, 13, WATER[4]);
      shade(g, 3, 14, 10, H - 15, CERAMIC, 0.3, 0.7);
      for (let y = 17; y <= H - 5; y += 2) g.hline(5, 10, y, STEEL[3]);
      g.vline(5, 17, H - 5, STEEL[3]);
      g.vline(10, 17, H - 5, STEEL[3]);
      g.vline(12, H - 4, H - 2, INK);
    },
  },

  file_cabinet: {
    // 왼쪽을 봄: 깊은 옆판, 서랍 앞판 끝과 손잡이가 왼쪽에
    side: (g, W, H, v) => {
      const top = H - 26;
      shade(g, 4, top, 9, 26, STEEL.map((c) => mix(c, 0xc8d0dc, 0.4)) as readonly Color[], 0.25, 0.65);
      g.hline(4, 12, top, ALU[0]);
      for (let i = 0; i < 4; i++) {
        const y = top + 2 + i * 6;
        g.vline(4, y, y + 4, ALU[1]);
        g.set(3, y + 3, STEEL[3]);
        g.hline(4, 12, y + 5, STEEL[2]);
      }
      if (has(v, "open")) {
        g.rect(1, top + 8, 4, 5, mix(STEEL[1], 0xc8d0dc, 0.5));
        g.hline(1, 4, top + 8, 0x6aa6e0);
        g.set(0, top + 11, STEEL[3]);
      }
      g.rect(8, top - 3, 4, 3, 0xd07a4e);
      for (const [x, y] of [[9, top - 4], [10, top - 5], [11, top - 4]] as const) g.set(x, y, LEAF[2]);
    },
    // 뒤: 민 철판 + 작은 상표 판
    back: (g, W, H) => {
      const top = H - 26;
      shade(g, 2, top, 12, 26, STEEL.map((c) => mix(c, 0xc8d0dc, 0.35)) as readonly Color[], 0.3, 0.7);
      g.hline(2, 13, top, ALU[1]);
      g.rect(10, H - 6, 2, 1, ALU[0]);
      g.rect(3, top - 3, 4, 3, 0xd07a4e);
      for (const [x, y] of [[4, top - 4], [5, top - 5], [6, top - 4]] as const) g.set(x, y, LEAF[2]);
    },
  },

  meeting_table: {
    // 왼쪽을 봄 (16 × 36): 긴 상판이 세로로, 다리 둘, 스피커 가운데·물병 위아래
    side: (g, W, H, v) => {
      const meet = has(v, "meet");
      for (let y = 2; y <= H - 9; y++)
        for (let x = 1; x <= 14; x++) {
          const r = y === 2 || y === H - 9 ? 2 : y === 3 ? 1 : 0;
          if (x < 1 + r || x > 14 - r) continue;
          g.set(x, y, pick(CREAM, 0.05 + (x / 14) * 0.2 + ((y - 2) / (H - 11)) * 0.15, x, y));
        }
      g.hline(2, 13, H - 8, CREAM[3]);
      g.hline(3, 12, H - 7, CREAM[4]);
      shadeX(g, 6, H - 6, 4, 5, ALU, 0.15, 0.6);
      g.hline(5, 10, H - 1, STEEL[3]);
      // 앞쪽 다리는 상판 아래로 가려지고 뒤 다리 발만 위로 살짝
      const cy = Math.floor((H - 7) / 2);
      g.hline(6, 10, cy + 2, STEEL[3]);
      g.hline(7, 9, cy + 1, STEEL[2]);
      g.set(8, cy, STEEL[1]);
      g.set(8, cy + 1, meet ? 0x9aff8a : 0x4ac46a);
      for (const y of [5, H - 14]) {
        g.vline(4, y, y + 3, WATER[1]);
        g.vline(5, y, y + 3, WATER[3]);
        g.set(4, y - 1, NAVY[2]);
      }
      g.rect(9, 6, 4, 5, ALU[2]);
      g.vline(9, 6, 10, ALU[3]);
      if (meet) g.vline(8, 6, 10, 0xd8f0ff);
      g.rect(10, H - 16, 3, 4, NAVY[2]);
    },
    // 뒤: 노트북 화면이 보인다 (회의 자료 막대그래프)
    back: (g, W, H, v) => {
      const tmp = new Grid(W, H);
      OFFICE_DRAW.meeting_table(tmp, W, H, v);
      g.draw(tmp.mirrored(), 0, 0);
      // 화면 (앞모습 노트북 자리의 거울 위치)
      const x0 = W - 12;
      g.rect(x0, 3, 5, 4, 0x2a3040);
      g.rect(x0 + 1, 4, 3, 2, has(v, "meet") ? 0xd8f0ff : 0x8ac4f0);
      g.vline(x0 + 1, 5, 5, 0xf0c050);
      g.vline(x0 + 2, 4, 5, 0x6ad08a);
      g.vline(x0 + 3, 4, 5, 0xe86a5a);
    },
  },

  rubber_tree: {
    side: (g, W, H, v) => {
      const tmp = new Grid(W, H);
      OFFICE_DRAW.rubber_tree(tmp, W, H, v);
      // 옆에서 보면 잎 몇 장이 앞뒤로 겹친다: 앞모습을 뒤집고 한 칸 좁힌다
      const m = tmp.mirrored();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = y < H - 9 ? Math.round(8 + (x - 8) * 1.12) : x;
        if (sx >= 0 && sx < W) g.px[y * W + x] = m.px[y * W + sx];
      }
    },
    back: flipOf("rubber_tree"),
  },

  quit_clock: {
    // 왼쪽을 봄: 시계 몸 두께만 (양면 시계라 테 둘 + 가운데 몸)
    side: (g, W, H, v) => {
      const six = has(v, "six");
      orb(g, 8, H - 2, 5, 1.6, STEEL, 0.1, 0.7);
      shadeX(g, 7, 13, 2, H - 15, ALU, 0.2, 0.65);
      for (let y = 0; y <= 14; y++) {
        const hw = Math.sqrt(Math.max(0, 1 - ((y - 7) / 7.2) ** 2));
        if (hw <= 0) continue;
        g.set(5, y, six ? GOLD[1] : NAVY[1]);
        g.set(6, y, six ? GOLD[2] : NAVY[2]);
        g.set(7, y, pick(STEEL, 0.1, 7, y));
        g.set(8, y, pick(STEEL, 0.3, 8, y));
        g.set(9, y, six ? GOLD[2] : NAVY[2]);
        g.set(10, y, six ? GOLD[3] : NAVY[3]);
      }
      g.set(6, 2, NAVY[0]);
      if (six) for (const [x, y] of [[3, 3], [12, 3], [2, 9], [13, 9]] as const) g.set(x, y, 0xfff4bc);
    },
    // 뒤: 양면 시계라 같은 얼굴 (뒤집지 않는다 — 바늘이 거꾸로 돌지 않게). 기둥 뒤쪽엔 바코드 비품 스티커가 붙어 있다
    back: (g, W, H, v) => {
      OFFICE_DRAW.quit_clock(g, W, H, v);
      g.rect(6, 17, 4, 3, PAPER[0]);
      for (const x of [6, 8, 9]) g.vline(x, 18, 19, INK);
      g.set(7, 17, PAPER[2]);
    },
  },

  approval_tray: {
    side: (g, W, H, v) => {
      const stamp = has(v, "stamp");
      shade(g, 4, H - 12, 9, 11, WALNUT, 0.25, 0.7);
      g.hline(3, 13, H - 13, WALNUT[0]);
      g.hline(3, 13, H - 12, WALNUT[1]);
      g.vline(4, H - 11, H - 3, WALNUT[1]);
      g.set(3, H - 7, BRASS[1]);
      g.hline(4, 12, H - 2, WALNUT[4]);
      // 서류함 옆모습 (비스듬한 칸 셋)
      for (let i = 0; i < 3; i++) {
        const y = H - 14 - i * 4;
        g.hline(5, 11, y, ALU[3]);
        g.hline(5, 10, y - 1, PAPER[0]);
        g.set(5, y - 2, ALU[2]);
        g.set(11, y - 2, ALU[2]);
        g.set(11, y - 1, ALU[3]);
      }
      g.vline(11, H - 23, H - 14, ALU[3]);
      g.rect(10, H - 15, 3, 2, RED[3]);
      g.vline(11, stamp ? H - 21 : H - 19, stamp ? H - 18 : H - 16, 0x8a5a36);
      if (stamp) g.set(7, H - 24, RED[1]);
    },
    back: flipOf("approval_tray"),
  },

  paper_pile: {
    side: (g, W, H, v) => {
      const tmp = new Grid(W, H);
      OFFICE_DRAW.paper_pile(tmp, W, H, tok(v, ""));
      // 옆에서 보면 두 더미가 앞뒤로 겹친다: 낮은 더미를 왼쪽 앞으로
      g.draw(tmp.mirrored(), 0, 0);
    },
    back: (g, W, H, v) => {
      const tmp = new Grid(W, H);
      OFFICE_DRAW.paper_pile(tmp, W, H, v);
      g.draw(tmp, 0, 0);
      // 뒤에서 보면 서류철 등이 보인다 (가로 색 띠 몇 줄)
      for (const [y, c] of [[H - 6, 0x7ab0e8], [H - 12, 0xe8c070], [H - 19, 0xe87a6a]] as const) for (let x = 0; x < W; x++) if (g.filled(x, y) && (g.get(x, y) >>> 8) !== 0x6a4430) g.set(x, y, c);
    },
  },

  boss_desk: {
    // 왼쪽을 봄 (16 × 40): 윗면이 세로로 길게, 아래 끝은 옆판. 명패는 왼쪽(손님 쪽)을 보고, 전화는 뒤쪽 끝
    side: (g, W, H) => {
      shade(g, 1, 4, W - 2, H - 12, WALNUT, 0.0, 0.2);
      g.vline(1, 4, H - 9, WALNUT[0]);
      g.hline(1, W - 2, 4, WALNUT[0]);
      // 가죽 받침 (세로로 길게)
      shade(g, 6, 11, 5, 16, rp("#8cc49a", "#62a274", "#468258", "#326240"), 0.1, 0.5);
      g.vline(6, 11, 26, 0xb0dcb8);
      // 명패 (쐐기: 금판은 왼쪽 면)
      g.vline(2, 15, 21, GOLD[0]);
      g.vline(3, 15, 21, GOLD[2]);
      g.vline(4, 15, 21, WALNUT[3]);
      // 전화기 (뒤 끝) + 펜꽂이 + 결재판
      g.rect(9, 5, 4, 4, MESH[2]);
      g.hline(9, 12, 5, MESH[1]);
      g.set(10, 8, 0x9aff8a);
      g.rect(11, H - 14, 2, 2, BRASS[2]);
      g.set(11, H - 15, RED[1]);
      g.set(12, H - 15, NAVY[1]);
      g.rect(8, H - 15, 2, 3, NAVY[2]);
      // 옆판 (판 장식 테)
      shade(g, 1, H - 8, W - 2, 6, WALNUT, 0.4, 0.8);
      g.hline(1, W - 2, H - 8, WALNUT[3]);
      g.hline(3, W - 4, H - 6, WALNUT[1]);
      g.vline(3, H - 6, H - 4, WALNUT[1]);
      g.vline(W - 4, H - 6, H - 4, WALNUT[4]);
      g.hline(1, W - 2, H - 2, WALNUT[4]);
    },
    // 뒤 (앉는 쪽): 양쪽 서랍 기둥 + 가운데 무릎 자리, 명패 뒷면은 민 나무
    back: (g, W, H) => {
      const top = 4;
      shade(g, 0, top, W, 5, WALNUT, 0.05, 0.3);
      g.hline(0, W - 1, top, WALNUT[0]);
      shade(g, 9, top + 1, 14, 3, rp("#8cc49a", "#62a274", "#468258", "#326240"), 0.2, 0.6);
      for (const x0 of [1, W - 10]) {
        shade(g, x0, top + 5, 9, H - top - 7, WALNUT, 0.3, 0.7);
        for (const y of [top + 9, top + 13]) g.hline(x0, x0 + 8, y, WALNUT[4]);
        for (const y of [top + 7, top + 11, top + 15]) g.hline(x0 + 3, x0 + 5, y, BRASS[1]);
      }
      shade(g, 10, top + 5, W - 20, H - top - 7, rp("#3a2416", "#2c1a10", "#20120a"), 0.2, 0.8);
      g.hline(0, W - 1, H - 2, WALNUT[4]);
      g.rect(12, top, 8, 3, WALNUT[2]);
      g.hline(12, 19, top, WALNUT[1]);
      g.rect(25, top - 2, 5, 3, MESH[2]);
      g.hline(25, 29, top - 3, MESH[1]);
      g.rect(4, top - 2, 2, 3, BRASS[2]);
      g.set(5, top - 3, NAVY[1]);
    },
  },

  banker_lamp: {
    side: (g, W, H, v) => {
      const lit = !has(v, "off");
      orb(g, 8, H - 11, 7.4, 2.4, WALNUT, 0.0, 0.5);
      g.hline(1, 14, H - 9, WALNUT[3]);
      shadeX(g, 7, H - 8, 2, 6, WALNUT, 0.3, 0.7);
      g.hline(3, 12, H - 2, WALNUT[3]);
      g.hline(4, 11, H - 1, WALNUT[4]);
      if (lit) for (let x = 3; x <= 8; x++) g.set(x, H - 12, x % 2 ? 0xe8b880 : 0xf0c890);
      g.rect(10, H - 13, 2, 2, PAPER[0]);
      bankerLampArt(g, 3, H - 12, lit, true);
    },
    back: flipOf("banker_lamp"),
  },

  massage_chair: {
    // 왼쪽을 봄: 살짝 젖힌 등판(오른쪽), 방석, 왼쪽 아래로 내려가는 종아리 발판
    side: (g, W, H, v) => {
      const buzz = has(v, "buzz");
      g.hline(2, 13, H - 1, MESH[3]);
      g.hline(3, 12, H - 2, MESH[2]);
      for (let y = H - 9; y <= H - 3; y++) for (let x = 1 + Math.floor((y - (H - 9)) * 0.3); x <= 5 + Math.floor((y - (H - 9)) * 0.3); x++) g.set(x, y, x === 1 + Math.floor((y - (H - 9)) * 0.3) ? CREAM[1] : pick(WALNUT, 0.35 + (y - (H - 9)) * 0.06, x, y));
      shade(g, 4, H - 12, 8, 4, CREAM, 0.05, 0.4);
      for (let y = 2; y <= H - 10; y++) {
        const x0 = 9 + Math.floor((y / (H - 10)) * -2) + 2;
        for (let x = x0; x <= x0 + 3; x++) g.set(x, y, x === x0 ? pick(CREAM, 0.1 + ((y - 2) % 3 === 0 ? 0.3 : 0), x, y) : pick(WALNUT, 0.2 + (x - x0) * 0.15, x, y));
      }
      orb(g, 10.5, 3.5, 2.6, 2, CREAM, 0.0, 0.5);
      shade(g, 4, H - 16, 8, 3, WALNUT, 0.2, 0.7);
      g.hline(4, 11, H - 16, CREAM[1]);
      g.set(5, H - 16, TEAL[1]);
      if (buzz) for (const [x, y] of [[0, 8], [1, 5], [15, 6], [15, 10]] as const) g.set(x, y, 0xfff4bc);
    },
    // 뒤: 둥근 등 덮개 + 통풍 홈 + 전선
    back: (g, W, H, v) => {
      g.hline(3, 12, H - 1, MESH[3]);
      g.hline(4, 11, H - 2, MESH[2]);
      for (const x0 of [0, 12]) shade(g, x0, H - 16, 4, 8, WALNUT, 0.45, 0.85);
      for (let y = 2; y <= H - 3; y++)
        for (let x = 2; x <= 13; x++) {
          if (y === 2 && (x < 4 || x > 11)) continue;
          if (y === 3 && (x < 3 || x > 12)) continue;
          g.set(x, y, pick(WALNUT, 0.15 + ((x - 2) / 11) * 0.35 + (y > H - 8 ? 0.15 : 0), x, y));
        }
      for (let y = 6; y <= 14; y += 2) g.hline(5, 10, y, WALNUT[4]);
      orb(g, 8, 3.5, 3.6, 1.8, CREAM, 0.3, 0.45);
      g.vline(8, H - 6, H - 2, INK);
      if (has(v, "buzz")) for (const [x, y] of [[0, 6], [15, 4], [15, 9]] as const) g.set(x, y, 0xfff4bc);
    },
  },

  leave_button: {
    // 왼쪽을 봄: 덮개가 뒤(오른쪽)로 젖혀진 옆모습
    side: (g, W, H, v) => {
      const press = has(v, "press");
      g.hline(3, 12, H - 1, STEEL[4]);
      g.hline(4, 11, H - 2, STEEL[3]);
      shadeX(g, 5, H - 12, 6, 8, STEEL, 0.15, 0.7);
      for (let y = H - 6; y <= H - 3; y++) for (let x = 5; x <= 10; x++) g.set(x, y, (x + y) % 4 < 2 ? HAZARD_Y : INK);
      g.hline(4, 11, H - 13, STEEL[1]);
      g.hline(4, 11, H - 12, STEEL[3]);
      for (let i = 0; i <= 7; i++) g.set(11 + Math.floor(i / 3), H - 13 - i, 0xcfe8f8, 190);
      if (press) {
        orb(g, 7.5, H - 14, 3.2, 1.2, RED, 0.3, 0.6);
        for (const [x, y, c] of [[2, 4, 0xffe680], [13, 3, 0x8ad0ff], [4, 1, 0xffb8ca], [9, 2, 0xffffff]] as const) g.set(x, y, c);
      } else {
        orb(g, 7.5, H - 15, 3.2, 2, RED, 0.05, 0.7);
        g.set(6, H - 17, 0xffffff);
      }
    },
    // 뒤: 덮개 경첩·전선·나사판
    back: (g, W, H, v) => {
      const press = has(v, "press");
      g.hline(2, 13, H - 1, STEEL[4]);
      g.hline(3, 12, H - 2, STEEL[3]);
      shadeX(g, 4, H - 12, 8, 10, STEEL, 0.3, 0.8);
      g.rect(6, H - 10, 4, 3, STEEL[1]);
      for (const [x, y] of [[6, H - 10], [9, H - 10], [6, H - 8], [9, H - 8]] as const) g.set(x, y, STEEL[3]);
      g.vline(8, H - 6, H - 2, INK);
      g.hline(3, 12, H - 13, STEEL[1]);
      orb(g, 8, press ? H - 14 : H - 15, 4, press ? 1.3 : 2.4, RED, 0.3, 0.6);
      // 젖힌 덮개는 앞(아래)으로 넘어와 단추 위를 비스듬히 가린다
      for (let x = 3; x <= 12; x++) g.set(x, H - 11, 0xcfe8f8, 170);
      g.set(3, H - 12, 0xcfe8f8, 170);
      g.set(12, H - 12, 0xcfe8f8, 170);
    },
  },
};

export const isOfficeArt = (id: string) => id in OFFICE_DRAW;
