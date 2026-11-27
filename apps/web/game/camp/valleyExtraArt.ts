// 11/26 캠핑장 그림 (6차 시안에서 옮김): 계곡 족욕탕 · 낚시 바위 · 4인 좌대 · 나룻배 선착장 · 펜션 정원 소품 · 순이 할머니. 캠핑장 그림 규칙 그대로 (윤곽 0x2c2018, 왼쪽 위 빛, 원점 = 바닥 가운데).

import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";
import { drawRaftHolder, RAFT_HOLDER_UP, raftRig } from "./raftRodsArt";
import { ROOFS } from "./valleyProps";

const OUT = 0x2c2018;
const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;
const DECK = { hi: 0xdcb888, mid: 0xc49a64, lo: 0x9a7448, line: 0x6a4a2c } as const;
const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228 } as const;
const STONE = { hi: 0xc8c2b4, mid: 0xa49e92, lo: 0x7e7972, line: 0x5a5650 } as const;
const SPA = { deep: 0x3fa08e, mid: 0x62c4aa, hi: 0xa6e8cc, foam: 0xeefaf0, rim: 0x2f7c6c } as const;
/** 족욕탕 물빛 (발 담근 자리 물 조각 — game/camp/campFootbath) */
export const FOOT_WATER = SPA;
const BAMBOO = { hi: 0xb4cc7c, mid: 0x8aa858, lo: 0x627c3c, tie: 0x6a4a2c } as const;
const LANTERN = { glow: 0xffd890, glow2: 0xffb860, cap: 0x4a321e } as const;
const XMAS = [0xff6a5a, 0xffd25a, 0x7ae08a, 0x7ac8ff, 0xfff2d8] as const;
const CUSHION = [0xc8484a, 0x3e5a8a, 0xd89a3a, 0x4f8a6a] as const;

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}
function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 60): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}
/** 둥근 네모 안인지 */
function inRound(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// ════════════════════════ 계곡 족욕탕 (노천) ════════════════════════

export const FOOTBATH = { w: 80, h: 122 } as const;
export type FootBathArt = { grid: Grid; lanterns: { x: number; y: number }[]; seats: { x: number; y: number; dir: "left" | "right" | "up" }[] };

/**
 * 나무 데크 위 돌 테 족욕탕 (보글보글 온천물 — 거품은 CampMap이 띄운다: game/camp/campFootbathBubbles) + 뒤 대나무 울·대나무 물대롱 + 양옆·앞 나무 벤치(방석) + 네 귀 작은 등롱 + 앞 계단.
 * 원점 = 바닥 가운데 (계단 아래). seats = 앉는 자리 (발을 물에 담근다)
 */
export function footBathArt(xmas: boolean): FootBathArt {
  const W = FOOTBATH.w;
  const H = FOOTBATH.h;
  const g = new Grid(W, H);
  // 데크 (가로 판자)
  const D0 = 20;
  const D1 = 108;
  for (let y = D0; y < D1; y++)
    for (let x = 2; x < W - 2; x++) {
      const k = (y - D0) % 5;
      const seam = (x + ((y - D0) / 5 | 0) * 13) % 26 === 0;
      g.set(x, y, k === 4 || seam ? DECK.line : k === 0 ? DECK.hi : DECK.mid);
    }
  g.rect(2, D1, W - 4, 3, DECK.lo);
  for (const x of [3, 24, 52, W - 7]) g.rect(x, D1 + 3, 4, 3, LOG.lo);
  // 앞 계단 (가운데 둘)
  g.rect(30, D1, 20, 4, DECK.mid);
  g.hline(30, 49, D1, DECK.hi);
  g.rect(32, D1 + 4, 16, 4, DECK.mid);
  g.hline(32, 47, D1 + 4, DECK.hi);
  g.hline(32, 47, D1 + 7, DECK.lo);
  // 뒤 대나무 울 (데크 뒤 끝)
  for (let x = 2; x < W - 2; x++) {
    const stalk = x % 4;
    const top = 6 + ((hash2(x >> 2, 3, 71) * 3) | 0);
    for (let y = top; y < D0 + 2; y++) g.set(x, y, stalk === 0 ? BAMBOO.lo : stalk === 1 ? BAMBOO.hi : BAMBOO.mid);
    if (stalk !== 0) g.set(x, top + 6, BAMBOO.lo);
  }
  g.hline(2, W - 3, 12, BAMBOO.tie);
  g.hline(2, W - 3, 18, BAMBOO.tie);
  if (xmas) for (let x = 6; x < W - 4; x += 5) g.set(x, 12, XMAS[(x / 5) % 5 | 0]);
  // 탕 (돌 테 + 온천물)
  const P0 = { x: 18, y: 32 };
  const P1 = { x: 61, y: 92 };
  for (let y = P0.y - 4; y <= P1.y + 4; y++)
    for (let x = P0.x - 4; x <= P1.x + 4; x++) {
      if (!inRound(x, y, P0.x - 4, P0.y - 4, P1.x + 4, P1.y + 4, 9)) continue;
      if (inRound(x, y, P0.x, P0.y, P1.x, P1.y, 6)) continue;
      // 돌 조각 (이음매 = 어두운 줄)
      const sx = Math.floor((x + (y % 7 < 4 ? 0 : 3)) / 6);
      const sy = Math.floor(y / 4);
      const seam = (x + (y % 7 < 4 ? 0 : 3)) % 6 === 0 || y % 4 === 0;
      const h = hash2(sx, sy, 37);
      const base = h < 0.33 ? STONE.hi : h < 0.75 ? STONE.mid : lighten(STONE.mid, 0.06);
      g.set(x, y, seam ? STONE.lo : y <= P0.y - 2 ? lighten(base, 0.08) : base);
    }
  for (let y = P0.y; y <= P1.y; y++)
    for (let x = P0.x; x <= P1.x; x++) {
      if (!inRound(x, y, P0.x, P0.y, P1.x, P1.y, 6)) continue;
      const edge = !inRound(x, y, P0.x + 2, P0.y + 2, P1.x - 2, P1.y - 2, 5);
      const depth = Math.min(x - P0.x, P1.x - x, y - P0.y, P1.y - y);
      let c: Color = depth > 9 ? SPA.deep : SPA.mid;
      if (y < P0.y + 3) c = SPA.rim;
      else if (edge) c = SPA.hi;
      if (!edge && hash2(x, y, 5) > 0.93) c = SPA.hi;
      g.set(x, y, c);
    }
  // 잔물결 (둥근 빛)
  for (const [cx, cy] of [
    [32, 50],
    [48, 68],
    [30, 80],
  ] as const)
    for (let a = 0; a < 18; a++) {
      const t = (a / 18) * Math.PI * 2;
      if (Math.sin(t) > 0.2) continue;
      g.set(Math.round(cx + Math.cos(t) * 5), Math.round(cy + Math.sin(t) * 2), SPA.foam);
    }
  // 대나무 물대롱 (울 → 탕) + 떨어지는 물
  g.rect(38, 14, 3, 18, BAMBOO.mid);
  g.vline(38, 14, 31, BAMBOO.hi);
  g.vline(40, 14, 31, BAMBOO.lo);
  for (const y of [18, 25]) g.hline(38, 40, y, BAMBOO.lo);
  g.rect(39, 32, 2, 4, SPA.foam);
  g.ellipse(39.5, 37.5, 4, 1.6, SPA.foam);
  // 벤치 (양옆 긴 벤치 + 앞 짧은 벤치 둘) — 물가에 붙어 앉아 발을 담근다
  const bench = (x: number, y: number, w: number, h: number) => {
    g.rect(x, y, w, h, WOOD.mid);
    for (let yy = y; yy < y + h; yy += 3) g.hline(x, x + w - 1, yy, WOOD.hi);
    g.hline(x, x + w - 1, y + h - 1, WOOD.lo);
    g.vline(x + w - 1, y, y + h - 1, WOOD.lo);
  };
  bench(5, 30, 7, 64);
  bench(W - 12, 30, 7, 64);
  bench(10, 99, 17, 5);
  bench(W - 27, 99, 17, 5);
  const seats: FootBathArt["seats"] = [];
  for (const [i, y] of [38, 54, 70, 86].entries()) {
    seats.push({ x: 8, y: y + 4, dir: "right" }, { x: W - 9, y: y + 4, dir: "left" });
    for (const [bx, side] of [
      [6, 0],
      [W - 11, 1],
    ] as const) {
      if (i === 3 && side === 1) continue;
      const c = CUSHION[(i + side * 2) % CUSHION.length];
      g.rect(bx, y, 5, 5, c);
      g.hline(bx, bx + 4, y, lighten(c, 0.25));
      g.hline(bx, bx + 4, y + 4, darken(c, 0.3));
    }
  }
  for (const x of [15, W - 22]) {
    const c = CUSHION[x < 40 ? 1 : 0];
    g.rect(x, 99, 6, 4, c);
    g.hline(x, x + 5, 99, lighten(c, 0.25));
    seats.push({ x: x + 3, y: 104, dir: "up" });
  }
  // 나무 바가지·수건 (오른쪽 앞 귀퉁이)
  g.rect(66, 99, 6, 4, LOG.mid);
  g.hline(66, 71, 99, LOG.hi);
  g.rect(66, 96, 6, 3, 0xf2efe6);
  g.hline(66, 71, 98, 0xd8d0c0);
  // 등롱 넷 (네 귀, 기둥 + 종이 등)
  const lanterns: { x: number; y: number }[] = [];
  for (const [x, y] of [
    [3, 30],
    [W - 5, 30],
    [3, 104],
    [W - 5, 104],
  ] as const) {
    g.rect(x, y - 12, 2, 12, LOG.lo);
    g.rect(x - 2, y - 19, 6, 7, LANTERN.glow);
    g.vline(x - 2, y - 19, y - 13, LANTERN.glow2);
    g.hline(x - 2, x + 3, y - 16, LANTERN.glow2);
    g.rect(x - 3, y - 21, 8, 2, LANTERN.cap);
    g.set(x, y - 22, LANTERN.cap);
    g.set(x + 1, y - 22, LANTERN.cap);
    lanterns.push({ x: x + 1, y: y - 16 });
  }
  g.outline(OUT);
  shadow(g, W / 2, D1 + 5, W / 2 - 2, 4, 50);
  return { grid: g, lanterns, seats };
}

/** 부표 줄 (좌대 구역과 나룻배 구역을 가른다): 밧줄 + 빨강·흰 부표 */
export function buoyLineArt(len: number): Grid {
  const g = new Grid(len, 8);
  for (let x = 0; x < len; x++) g.set(x, 4 + (Math.sin(x * 0.35) > 0.6 ? 1 : 0), 0xe8dcc0, 200);
  for (let x = 3, i = 0; x < len - 2; x += 12, i++) {
    const c = i % 2 ? 0xf4f0e8 : 0xe0483a;
    g.ellipse(x + 1.5, 4, 2.6, 2.2, c);
    g.set(x, 3, lighten(c, 0.3));
  }
  g.outline(OUT);
  return g;
}

// ════════════════════════ 낚시 바위 (달그늘 소 양옆) ════════════════════════

export const FISHROCK = { w: 34, h: 26, seatY: 9 } as const;
/** 물가에 반쯤 잠긴 납작 바위 + 작은 나무 의자 + 낚싯대 받침(두 대, 물 쪽으로). 물은 오른쪽 (왼쪽 바위는 뒤집어 쓴다) */
export function fishRockArt(v: number): Grid {
  const W = FISHROCK.w;
  const H = FISHROCK.h;
  const g = new Grid(W, H);
  const cx = 15;
  const cy = 16;
  // 바위 (위는 판판, 옆은 둥글게)
  for (let y = 6; y < 25; y++)
    for (let x = 1; x < 30; x++) {
      const dx = (x + 0.5 - cx) / (13.5 + v);
      const dy = (y + 0.5 - cy) / 8.5;
      if (dx * dx + dy * dy > 1) continue;
      const top = y < cy - 2 + Math.abs(dx) * 3;
      const h = hash2(x >> 1, y >> 1, 13 + v);
      g.set(x, y, top ? (h > 0.6 ? STONE.hi : lighten(STONE.mid, 0.12)) : y > 20 ? STONE.lo : h > 0.7 ? STONE.lo : STONE.mid);
    }
  // 물 쪽 아래 젖은 그림자 줄
  for (let x = 16; x < 30; x++) for (let y = 21; y < 25; y++) if (g.filled(x, y)) g.set(x, y, darken(STONE.lo, 0.15));
  // 작은 나무 의자
  g.rect(9, 9, 8, 3, WOOD.hi);
  g.hline(9, 16, 11, WOOD.lo);
  g.vline(10, 12, 14, WOOD.lo);
  g.vline(15, 12, 14, WOOD.lo);
  // 낚싯대 받침 (Y자) + 두 대 (물 쪽 오른쪽 위로) + 낚싯줄
  g.vline(22, 7, 13, LOG.lo);
  g.set(21, 7, LOG.lo);
  g.set(23, 7, LOG.lo);
  line(g, 19, 12, 32, 1, 0x4a321e);
  line(g, 20, 13, 33, 6, 0x5a3a22);
  g.set(32, 1, 0xe84a3a);
  g.set(33, 6, 0xe84a3a);
  // 미끼통
  g.rect(4, 12, 4, 3, 0x6a8aa0);
  g.hline(4, 7, 12, 0x9ab8c8);
  g.outline(OUT);
  return g;
}

// ════════════════════════ 4인 좌대 (윤슬 낚시터) ════════════════════════

/** 3×5 숫자 (좌대 번호판) */
const RAFT_DIGITS: readonly string[] = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
/** 11/27 좌대 전용 팔걸이 낚시의자 (11×12, 아래 가운데 = 다리 끝 — 시안 jwadaemock/art/raft.ts): 짙은 초록 천 · 은색 틀 · 나무 팔받침 · 컵 홀더 */
function raftChairArt(): Grid {
  const g = new Grid(11, 12);
  const C = 0x3e6a4a;
  const CH = 0x5a8a62;
  const CL = 0x2a4a34;
  const F = 0xb8bcc4;
  const FL = 0x7a808a;
  g.hline(2, 8, 0, F);
  g.rect(2, 1, 7, 3, C);
  g.hline(2, 8, 1, CH);
  g.vline(8, 1, 3, CL);
  for (const x of [0, 10]) g.vline(x, 3, 8, F);
  g.hline(0, 1, 3, 0xc8925a);
  g.hline(9, 10, 3, 0xc8925a);
  g.set(10, 2, 0x2a2a30);
  g.rect(1, 4, 9, 4, C);
  g.hline(1, 9, 4, CH);
  g.hline(1, 9, 7, CL);
  g.set(2, 8, FL);
  g.set(3, 9, FL);
  g.set(8, 8, FL);
  g.set(7, 9, FL);
  g.set(5, 9, F);
  g.set(3, 10, F);
  g.set(7, 10, F);
  g.set(2, 11, FL);
  g.set(8, 11, FL);
  g.outline(OUT);
  return g;
}

/** 좌대 번호판 (오두막 지붕 앞 가운데 — 그림 x 31~39 · 2~10줄). 지붕 눈(roof 칸)에서 뺀다 */
export const RAFT_PLATE = { x: 31, y: 2, w: 9, h: 9 } as const;

/**
 * 4인 좌대: 넓힌 평상(드럼 넷) + 뒤 작은 지붕 오두막(지붕 앞 번호판) + 앞 낚시 의자 넷·낚싯대 넷 + 물 사다리.
 * opts.n = 번호판 숫자 · opts.walks = 잔교에서 마루까지 판자 다리 칸 (그림 x — protocol campRaftWalks와 같은 자리, 걷는 폭 12) ·
 * opts.snowy = 겨울판 (다리 난간 위에만 얇은 눈 줄 — 다리 판자는 덮지 않는다)
 */
export function raft4Art(roofI: number, xmas: boolean, ladder: "left" | "front", opts: { n?: number; walks?: readonly number[]; snowy?: boolean } = {}): { grid: Grid; roof: Uint8Array; seats: number[] } {
  // 11/26 좌대를 넓혔다 (68×48 → 72×57): 마루 62×23 → 66×32 (뒤로 9 깊어져 오두막 둘레에 걸을 자리 — 운영자 「좌대가 너무 좁다」).
  // 받침(아래 끝)·앞 끝·낚시 의자·사다리는 아래 기준 그대로, 오두막은 마루 뒤 끝에 붙어 위로 물러났다. X = 옛 그림 x + 2, D = 옛 줄 + 9 (마루 아래쪽)
  const W = 72;
  const H = 57;
  const X = 2;
  const D = 9;
  const g = new Grid(W, H);
  const R = ROOFS[roofI % ROOFS.length];
  for (let y = 17; y < 40 + D; y++)
    for (let x = 3; x < W - 3; x++) {
      const k = (x - 3) % 4;
      g.set(x, y, y === 17 ? DECK.hi : k === 3 ? DECK.line : DECK.mid);
    }
  // 마루 가운데 가로 이음판 (넓어진 마루가 밋밋하지 않게)
  for (let x = 3; x < W - 3; x++) if ((x - 3) % 4 !== 3) g.set(x, 17 + 11, DECK.hi);
  g.rect(3, 40 + D, W - 6, 3, 0x3a6a8a);
  for (const x of [5, 22, 42, 59]) g.rect(x, 40 + D, 8, 4, 0x2a5a8a);
  // 오두막 (뒤 가운데)
  g.rect(20 + X, 10, 28, 11, LOG.mid);
  for (let y = 10; y < 21; y += 3) g.hline(20 + X, 47 + X, y, LOG.hi);
  g.rect(25 + X, 13, 6, 5, 0xffd890);
  g.set(27 + X, 14, 0xfff4d0);
  g.rect(37 + X, 13, 6, 8, LOG.lo);
  for (let y = 2; y < 11; y++) {
    const inset = Math.max(0, 7 - y);
    for (let x = 17 + X + inset; x < 51 + X - inset; x++) g.set(x, y, y === 10 ? R.lo : (x + y) % 5 === 0 ? R.lo : y < 5 ? R.hi : R.mid);
  }
  if (xmas) for (let x = 18 + X; x < 50 + X; x += 3) g.set(x, 11, XMAS[((x - X) / 3) % 5 | 0]);
  // 오두막 앞 작은 화분 둘 · 양동이 (넓어진 뒤 마루)
  for (const px of [14, 56]) {
    g.rect(px, 18, 4, 3, 0xc8704a);
    g.hline(px, px + 3, 18, 0xe08a5a);
    g.rect(px + 1, 15, 2, 3, 0x5a9a4a);
  }
  g.rect(8, 19, 4, 3, 0x6a8aa0);
  g.hline(8, 11, 19, 0x9ab8c8);
  // 11/27 앞 낚시 의자 하나 (좌대 입장권 주인 혼자 — 운영자: 의자 넷 대신 하나) + 낚싯대 하나.
  // 앞 끝 가운데 (protocol campRaftSeatDx — 물 건너 좌대는 가운데가 사다리라 오른쪽). 주인이 앉아 낚시하면 받침틀 낚싯대 넷(game/camp/CampRafts)
  // 11/27 시안(좌대시안 03·04번): 좌대 전용 팔걸이 낚시의자 + 마루 앞 끝 빈 낚싯대 받침틀 (주인이 앉으면 받침틀에 낚싯대 넷 — raftRodsArt)
  const sdx = ladder === "front" ? 11 : 0;
  const seats = [W / 2 - 3 + sdx];
  const cx = W / 2 + sdx;
  g.draw(raftChairArt(), cx - 5, 47 - 12 + 1);
  drawRaftHolder(g, cx, H - RAFT_HOLDER_UP, raftRig(ladder === "left"));
  // 미끼통: 의자 옆 (물 건너 좌대는 사다리 왼쪽)
  const bait = ladder === "front" ? 20 + X : 44 + X;
  g.rect(bait, 31 + D, 8, 4, 0x6a8aa0);
  g.hline(bait, bait + 7, 31 + D, 0x9ab8c8);
  if (ladder === "front") {
    // 11/26 물 쪽에서 잘 보이는 앞 사다리 (운영자: 헤엄쳐 가서 사다리로만 오른다) — 은색 손잡이가 마루 위로 휘어 올라오고 흰 디딤판 넷
    for (const x of [30 + X, 37 + X]) {
      g.rect(x, 35 + D, 2, 13, 0xe8ecf0);
      g.vline(x + 1, 36 + D, 47 + D, 0x9aa0a8);
    }
    g.hline(30 + X, 31 + X, 34 + D, 0xffffff);
    g.hline(37 + X, 38 + X, 34 + D, 0xffffff);
    for (let y = 41 + D; y < 48 + D; y += 2) g.hline(32 + X, 36 + X, y, 0xffffff);
  } else {
    // 11/26 잔교에 붙은 좌대: 잔교 아래 끝 → 마루 뒤 끝 판자 다리 (운영자 「연결 부분을 다리로 표현해 줘야지」).
    // 걷는 방향과 직각인 가로 판자(3줄마다 이음새) + 양쪽 난간 귀틀(기둥 머리 5줄마다) — 다리 옆·사이는 물이 보인다
    for (const x0 of opts.walks ?? []) {
      for (let y = 0; y < 17; y++)
        for (let x = x0; x < x0 + 12; x++) {
          const seam = y % 3 === 2;
          // 판자 끝을 한 칸씩 엇갈리게 (판자가 한 장씩 보이게)
          const edge = (x === x0 || x === x0 + 11) && (y % 6 < 3) === (x === x0);
          g.set(x, y, seam ? DECK.line : edge ? DECK.lo : y % 3 === 0 ? DECK.hi : DECK.mid);
        }
      for (const rx of [x0 - 1, x0 + 12]) {
        g.vline(rx, 0, 16, opts.snowy ? 0xeef4fa : LOG.mid);
        for (let y = 1; y < 17; y += 5) {
          g.set(rx, y, LOG.lo);
          g.set(rx, y + 1, LOG.lo);
        }
      }
      // 마루 뒤 끝과 만나는 문턱 판
      g.hline(x0, x0 + 11, 16, DECK.lo);
    }
  }
  // 번호판 (지붕 앞 가운데 — 크림 판 + 진한 테 + 숫자)
  if (opts.n !== undefined) {
    const P = RAFT_PLATE;
    g.rect(P.x, P.y, P.w, P.h, 0xf4ecd6);
    for (let x = P.x; x < P.x + P.w; x++) {
      g.set(x, P.y, LOG.lo);
      g.set(x, P.y + P.h - 1, LOG.lo);
    }
    g.vline(P.x, P.y, P.y + P.h - 1, LOG.lo);
    g.vline(P.x + P.w - 1, P.y, P.y + P.h - 1, LOG.lo);
    const d = RAFT_DIGITS[opts.n % 10];
    for (let i = 0; i < 15; i++) if (d[i] === "1") g.set(P.x + 3 + (i % 3), P.y + 2 + Math.floor(i / 3), 0x2a2a44);
  }
  // 지붕 눈 칸: 오두막 지붕만 (다리·번호판은 덮지 않는다)
  const roof = new Uint8Array(W * H);
  const P = RAFT_PLATE;
  for (let y = 0; y < 11; y++)
    for (let x = 17 + X; x < 51 + X; x++) {
      const plate = opts.n !== undefined && x >= P.x && x < P.x + P.w && y >= P.y && y < P.y + P.h;
      if (g.filled(x, y) && !plate) roof[y * W + x] = 1;
    }
  g.outline(OUT);
  return { grid: g, roof, seats: seats.map((x) => x + 3 - W / 2) };
}

// ════════════════════════ 나룻배 선착장 ════════════════════════

/** 물 위로 뻗은 좁은 나무 선착장 (가로, 폭 14) + 물속 말뚝 + 끝 계류 말뚝 둘 + 작은 등 */
export function rowDockArt(len: number): Grid {
  const H = 34;
  const g = new Grid(len, H);
  const top = 12;
  for (let x = 0; x < len; x++)
    for (let y = top; y < top + 14; y++) {
      const k = x % 5;
      g.set(x, y, k === 4 ? DECK.line : y === top ? DECK.hi : k === 0 ? DECK.hi : DECK.mid);
    }
  g.rect(0, top + 14, len, 3, DECK.lo);
  for (let x = 6; x < len; x += 16) {
    g.rect(x, top + 17, 3, 5, LOG.lo);
    g.set(x + 1, top + 21, 0x1a3442);
  }
  // 계류 말뚝 (끝 양옆) + 밧줄
  for (const y of [top - 4, top + 12]) {
    g.rect(len - 6, y, 4, 6, LOG.mid);
    g.hline(len - 6, len - 3, y, LOG.hi);
    g.set(len - 5, y + 3, 0xe8d8b0);
  }
  // 등 (뿌리 쪽 기둥)
  g.rect(3, 0, 2, top + 2, LOG.lo);
  g.rect(1, 0, 6, 5, LANTERN.glow);
  g.hline(1, 6, 0, LANTERN.cap);
  g.outline(OUT);
  return g;
}

/** 「나룻배 · 2인」 작은 팻말 (배 그림) */
export function boatSignArt(): Grid {
  const g = new Grid(24, 24);
  g.rect(11, 12, 2, 11, WOOD.lo);
  g.rect(1, 2, 22, 11, 0xf2ead8);
  for (let x = 1; x < 23; x++) {
    g.set(x, 2, WOOD.line);
    g.set(x, 12, WOOD.line);
  }
  g.vline(1, 2, 12, WOOD.line);
  g.vline(22, 2, 12, WOOD.line);
  for (let x = 6; x < 18; x++) g.set(x, 8 + (Math.abs(x - 12) > 4 ? -1 : 0), 0x8a5a3a);
  g.hline(7, 16, 9, 0x8a5a3a);
  for (let x = 3; x < 21; x++) g.set(x, 11, (x & 1) === 0 ? 0x3a86b8 : 0x6ab0d8);
  g.ellipse(10, 6, 1.4, 1.4, 0xe8b894);
  g.ellipse(14, 6, 1.4, 1.4, 0xe8b894);
  g.outline(OUT);
  return g;
}

// ════════════════════════ 펜션 정원 잔디 (일반 판) ════════════════════════

/** 깎은 잔디 마당 (줄무늬 · 가장자리는 들쭉날쭉 풀로 바닥에 녹아든다 · 군데군데 떨어진 잎) */
export function lawnArt(w: number, h: number): Grid {
  const g = new Grid(w, h);
  const A = 0x7e9a46;
  const B = 0x8aa64e;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      const n = hash2(x >> 1, y >> 1, 611);
      if (e < 6 && n > e / 6) continue;
      let c: Color = ((x + (y >> 2)) / 14) % 2 < 1 ? A : B;
      if (hash2(x, y, 613) < 0.06) c = lighten(c, 0.12);
      else if (hash2(x, y, 617) < 0.05) c = darken(c, 0.12);
      if (hash2(x >> 1, y >> 1, 619) < 0.012) c = [0xf2c444, 0xe68a38, 0xd65632][(hash2(x, y, 621) * 3) | 0];
      g.set(x, y, c);
    }
  return g;
}

// ════════════════════════ 절벽 밑 돌무더기 (scree) ════════════════════════

/** 절벽 끝 밑동에 굴러떨어진 바위·자갈 무더기 (큰 바위 셋 + 작은 돌 + 자갈, 바닥 그림자). 원점 = 바닥 가운데 */
export function screeArt(seed: number, snowy: boolean, mossy: boolean): Grid {
  const W = 64;
  const H = 30;
  const g = new Grid(W, H);
  // 바닥 그림자
  for (let y = 18; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2);
      const dy = (y + 0.5 - 24) / 6;
      if (dx * dx + dy * dy <= 1) g.set(x, y, 0x1a1410, 70);
    }
  const r = (i: number) => hash2(i, seed, 631);
  const stones: [number, number, number, number][] = [];
  // 큰 바위 (뒤) → 작은 돌 (앞)
  stones.push([20 + r(1) * 6, 16, 11, 8], [40 + r(2) * 6, 17, 9, 7], [30, 20, 8, 6]);
  for (let i = 0; i < 7; i++) stones.push([6 + r(10 + i) * 52, 21 + r(20 + i) * 5, 2.5 + r(30 + i) * 2.5, 2 + r(40 + i) * 1.6]);
  for (const [cx, cy, rx, ry] of stones) {
    const tmp = new Grid(W, H);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const q = dx * dx + dy * dy;
        if (q > 1) continue;
        const lit = -dx * 0.5 - dy * 0.7 + (hash2(x, y, 633 + seed) - 0.5) * 0.25;
        let c: Color = lit > 0.35 ? STONE.hi : lit > -0.1 ? STONE.mid : lit > -0.5 ? STONE.lo : STONE.line;
        if (dy < -0.45 && rx > 5) c = snowy ? (dy < -0.7 ? 0xf6f8fa : 0xdfe6ee) : mossy && hash2(x, y, 637) < 0.6 ? (dy < -0.7 ? 0x9aa65a : 0x7c8a4a) : c;
        tmp.set(x, y, c);
      }
    tmp.outline(OUT);
    g.draw(tmp, 0, 0);
  }
  // 자갈
  for (let i = 0; i < 26; i++) {
    const x = Math.round(4 + r(60 + i) * (W - 8));
    const y = Math.round(22 + r(90 + i) * 7);
    if (g.filled(x, y) && (g.get(x, y) & 255) > 100) continue;
    g.set(x, y, r(120 + i) < 0.5 ? STONE.mid : STONE.lo);
    if (r(150 + i) < 0.4) g.set(x + 1, y, STONE.hi);
  }
  return g;
}

// ════════════════════════ 7차: 고급 펜션 소품 ════════════════════════

/** 개별 바비큐 스테이션: 조리대(위 도마·고기 바구니·집게) + 오른쪽 그릴(숯불) */
export function bbqStationArt(): Grid {
  const g = new Grid(36, 26);
  // 조리대
  g.rect(1, 8, 20, 4, 0xe8e0d0);
  g.hline(1, 20, 8, 0xfaf6ee);
  g.rect(2, 12, 18, 11, WOOD.mid);
  for (const x of [2, 11]) {
    g.rect(x + 1, 13, 7, 9, WOOD.lo);
    g.rect(x + 2, 14, 5, 7, WOOD.mid);
    g.set(x + 6, 17, 0xe8c070);
  }
  // 도마 + 고기 바구니(바구니 결 · 고기 · 상추)
  g.rect(3, 6, 7, 3, 0xd8b078);
  g.rect(12, 3, 8, 6, 0xc89850);
  for (let x = 12; x < 20; x += 2) g.vline(x, 4, 8, 0xa87838);
  g.rect(13, 2, 3, 2, 0xd0605a);
  g.rect(16, 2, 3, 2, 0x7ab84a);
  g.set(14, 1, 0xe88a80);
  // 그릴 (뚜껑 열린 통 그릴)
  g.rect(22, 9, 12, 7, 0x3a3a40);
  g.hline(22, 33, 9, 0x5a5a62);
  for (let x = 23; x < 33; x += 2) g.set(x, 10, 0xff8a40);
  g.hline(23, 32, 11, 0x6a6a70);
  g.rect(22, 2, 12, 6, 0x2a2a30);
  g.hline(23, 32, 3, 0x4a4a52);
  g.vline(24, 16, 23, 0x2a2a30);
  g.vline(31, 16, 23, 0x2a2a30);
  g.hline(24, 31, 20, 0x2a2a30);
  g.outline(OUT);
  shadow(g, 18, 24, 17, 2, 50);
  return g;
}
/** 통유리 난간 (테라스 앞 · 투명 유리 + 나무 손잡이) */
export function glassRailArt(len: number): Grid {
  const g = new Grid(len, 11);
  for (let x = 0; x < len; x++) {
    g.set(x, 1, WOOD.hi);
    g.set(x, 2, WOOD.lo);
    for (let y = 3; y < 10; y++) g.set(x, y, (x + y) % 9 === 0 ? 0xffffff : 0xbfe6f0, (x + y) % 9 === 0 ? 200 : 96);
  }
  for (let x = 0; x < len; x += 12) g.vline(x, 1, 10, 0x8a9aa4);
  g.vline(len - 1, 1, 10, 0x8a9aa4);
  return g;
}
/** 아래 단 데크 (테라스 앞 한 단 낮은 넓은 데크 · 가운데 계단) */
export function lowerDeckArt(w: number, d: number): Grid {
  const g = new Grid(w, d + 4);
  for (let y = 0; y < d; y++)
    for (let x = 0; x < w; x++) {
      const k = x % 5;
      g.set(x, y, k === 4 ? DECK.line : y === 0 ? DECK.hi : k === 0 ? DECK.hi : DECK.mid);
    }
  g.rect(0, d, w, 2, DECK.lo);
  const sx = Math.round(w / 2 - 9);
  g.rect(sx, d, 18, 3, DECK.mid);
  g.hline(sx, sx + 17, d, DECK.hi);
  g.hline(sx, sx + 17, d + 2, DECK.lo);
  g.outline(OUT);
  return g;
}
/** 꼬마전구 아치 (길 위 · 둥근 쇠 틀 + 전구) */
export function lightArchArt(w: number, xmas: boolean): { grid: Grid; bulbs: { x: number; y: number }[] } {
  const H = 34;
  const g = new Grid(w, H);
  const bulbs: { x: number; y: number }[] = [];
  const rx = (w - 4) / 2;
  const cx = w / 2;
  for (let a = 0; a <= 180; a += 2) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(cx - Math.cos(t) * rx);
    const y = Math.round(14 - Math.sin(t) * 12);
    g.set(x, y, 0x4a4a52);
    g.set(x, y + 1, 0x2a2a30);
  }
  g.rect(1, 14, 2, H - 14, 0x4a4a52);
  g.rect(w - 3, 14, 2, H - 14, 0x4a4a52);
  for (let i = 0, a = 6; a <= 174; a += 14, i++) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(cx - Math.cos(t) * rx);
    const y = Math.round(14 - Math.sin(t) * 12) + 2;
    g.set(x, y, xmas ? XMAS[i % 5] : 0xffe6a0);
    bulbs.push({ x, y });
  }
  for (let y = 16; y < H - 2; y += 5) {
    g.set(1, y, xmas ? XMAS[(y / 5) % 5 | 0] : 0xffe6a0);
    g.set(w - 2, y + 2, xmas ? XMAS[(y / 5 + 2) % 5 | 0] : 0xffe6a0);
  }
  return { grid: g, bulbs };
}
/** 낮은 정원등 (둥근 유리 갓) */
export function gardenLampArt(): Grid {
  const g = new Grid(8, 16);
  g.rect(3, 6, 2, 9, 0x3a3a40);
  g.rect(1, 14, 6, 2, 0x3a3a40);
  g.ellipse(4, 4, 3, 3, 0xfff0c0);
  g.set(3, 3, 0xffffff);
  g.hline(1, 6, 1, 0x3a3a40);
  g.outline(OUT);
  return g;
}
/** 디딤돌 하나 */
export function stepStoneArt(v: number): Grid {
  const g = new Grid(10, 6);
  g.ellipse(5, 3, 4 + (v % 2) * 0.6, 2.2, STONE.mid);
  g.hline(3, 6, 1, STONE.hi);
  g.hline(3, 7, 4, STONE.lo);
  g.outline(0x5a5650);
  return g;
}
/** 작은 연못 + 아치 나무다리 (일반 = 물·연잎 / 겨울 = 언 물) */
export function pondBridgeArt(snowy: boolean): Grid {
  const W = 62;
  const H = 36;
  const g = new Grid(W, H);
  const cx = 31;
  const cy = 22;
  for (let y = 6; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / 29;
      const dy = (y + 0.5 - cy) / 12;
      const q = dx * dx + dy * dy;
      if (q > 1) continue;
      if (q > 0.72) {
        const h = hash2(x >> 1, y >> 1, 651);
        g.set(x, y, h < 0.4 ? STONE.hi : h < 0.8 ? STONE.mid : STONE.lo);
        continue;
      }
      let c: Color = snowy ? (q < 0.3 ? 0xcfe2ec : 0xb4cede) : q < 0.3 ? 0x3a8aa8 : 0x4a9ab6;
      if (!snowy && hash2(x, y, 653) < 0.03) c = 0xa8dcea;
      if (snowy && hash2(x, y, 655) < 0.05) c = 0xf2f8fa;
      g.set(x, y, c);
    }
  if (!snowy) {
    for (const [x, y] of [
      [12, 18],
      [48, 26],
      [44, 16],
    ] as const) {
      g.ellipse(x, y, 2.6, 1.6, 0x5a9a4a);
      g.set(x + 1, y - 1, 0x7ab85a);
    }
    g.set(13, 17, 0xf2a8c0);
    g.set(45, 15, 0xf8f0f0);
  }
  // 아치 다리 (가로지른다)
  for (let x = 14; x < 48; x++) {
    const t = (x - 14) / 33;
    const lift = Math.round(Math.sin(t * Math.PI) * 6);
    for (let y = 18 - lift; y < 25 - lift; y++) g.set(x, y, (x - 14) % 4 === 3 ? DECK.line : y === 18 - lift ? DECK.hi : DECK.mid);
    g.set(x, 25 - lift, DECK.lo);
    g.set(x, 14 - lift, 0xb8483a);
    g.set(x, 15 - lift, 0x8a2e26);
    if ((x - 14) % 8 === 0) g.vline(x, 14 - lift, 18 - lift, 0x8a2e26);
  }
  g.outline(OUT);
  return g;
}
/** 「소슬 펜션」 나무 간판 (두 기둥 + 판, 글씨는 장면에서 얹는다) */
export function penSignArt(): Grid {
  const g = new Grid(44, 26);
  g.rect(4, 10, 3, 16, LOG.lo);
  g.rect(37, 10, 3, 16, LOG.lo);
  g.rect(1, 3, 42, 12, WOOD.mid);
  g.hline(1, 42, 3, WOOD.hi);
  g.hline(1, 42, 14, WOOD.lo);
  g.rect(3, 5, 38, 8, 0x5a3a22);
  g.rect(18, 0, 8, 4, WOOD.lo);
  g.set(21, 1, 0xffd890);
  g.set(22, 1, 0xffd890);
  g.outline(OUT);
  return g;
}
/** 작은 차 (옆모습, 둥근 해치백) */
export function carArt(color: Color): Grid {
  const g = new Grid(44, 24);
  const hi = lighten(color, 0.2);
  const lo = darken(color, 0.25);
  for (let y = 10; y < 19; y++) for (let x = 2; x < 42; x++) g.set(x, y, y === 10 ? hi : y > 16 ? lo : color);
  for (let y = 3; y < 10; y++) {
    const a = 9 + Math.max(0, 9 - y);
    const b = 33 - Math.max(0, 6 - y);
    for (let x = a; x < b; x++) g.set(x, y, y === 3 ? hi : color);
  }
  g.rect(12, 5, 9, 5, 0x9ac4d8);
  g.rect(23, 5, 8, 5, 0x9ac4d8);
  g.set(13, 5, 0xeaf6fa);
  g.vline(22, 4, 16, lo);
  g.rect(40, 12, 2, 2, 0xfff0b0);
  g.rect(2, 12, 2, 2, 0xe04a3a);
  for (const wx of [11, 33]) {
    g.ellipse(wx, 19, 4, 4, 0x2a2a30);
    g.ellipse(wx, 19, 1.6, 1.6, 0xa8a8b0);
  }
  g.outline(OUT);
  shadow(g, 22, 22.5, 20, 1.6, 60);
  return g;
}
/** 자전거 (옆모습, 바구니) */
export function bikeArt(): Grid {
  const g = new Grid(22, 14);
  for (const wx of [5, 16]) {
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      g.set(Math.round(wx + Math.cos(t) * 3.5), Math.round(9 + Math.sin(t) * 3.5), 0x2a2a30);
    }
    g.set(wx, 9, 0x8a8a92);
  }
  line(g, 5, 9, 10, 9, 0x3a8a9a);
  line(g, 10, 9, 14, 4, 0x3a8a9a);
  line(g, 7, 4, 14, 4, 0x3a8a9a);
  line(g, 7, 4, 5, 9, 0x3a8a9a);
  line(g, 14, 4, 16, 9, 0x3a8a9a);
  g.hline(6, 8, 2, 0x3a2a20);
  g.rect(15, 1, 5, 3, 0xc89850);
  g.hline(13, 15, 2, 0x5a5a60);
  return g;
}

// ════════════════════════ 순이 할머니 (촌캉스 분양) ════════════════════════

/** 머릿수건(흰 바탕 파란 땡땡이) · 꽃무늬 몸빼 · 보라 조끼 · 지팡이 · 살짝 굽은 등. 20×30 (캠핑장 NPC 크기) */
export function sooniArt(snowy: boolean): Grid {
  const W = 20;
  const H = 30;
  const g = new Grid(W, H);
  const cx = 9;
  const base = H - 2;
  const skin = 0xf0c8a0;
  // 몸빼 (분홍 꽃무늬, 통 넓게)
  g.rect(cx - 5, base - 7, 4, 6, 0xd87a9a);
  g.rect(cx, base - 7, 4, 6, 0xd87a9a);
  for (const [x, y] of [
    [-4, -6],
    [2, -4],
    [-3, -3],
    [1, -7],
  ])
    g.set(cx + x, base + y, 0xfff0a0);
  g.rect(cx - 5, base - 1, 4, 1, 0x3a2a20);
  g.rect(cx, base - 1, 4, 1, 0x3a2a20);
  // 몸통 (연한 블라우스) + 조끼
  const by = base - 15;
  g.rect(cx - 5, by, 10, 9, 0xf2ead8);
  g.rect(cx - 5, by, 3, 9, snowy ? 0x7a3a6a : 0x6a4a8a);
  g.rect(cx + 2, by, 3, 9, snowy ? 0x7a3a6a : 0x6a4a8a);
  if (snowy) for (const y of [by + 3, by + 6]) g.hline(cx - 5, cx + 4, y, 0x5a2a52);
  g.rect(cx - 7, by + 1, 2, 7, 0xf2ead8);
  g.rect(cx + 5, by + 1, 2, 6, 0xe2dac8);
  g.set(cx - 7, by + 8, skin);
  g.set(cx + 6, by + 7, skin);
  // 머리 (조금 앞으로 숙임)
  const hy = by - 8;
  g.ellipse(cx + 1, hy + 4, 4.5, 4.5, skin);
  g.set(cx - 1, hy + 5, 0x2a2018);
  g.set(cx + 3, hy + 5, 0x2a2018);
  g.hline(cx - 1, cx + 0, hy + 4, 0x8a6a50);
  g.hline(cx + 3, cx + 4, hy + 4, 0x8a6a50);
  g.set(cx - 2, hy + 6, 0xf0a090);
  g.set(cx + 4, hy + 6, 0xf0a090);
  // 흰 머리 + 머릿수건 (옆 매듭)
  g.rect(cx - 3, hy + 1, 8, 1, 0xe8e6e0);
  g.rect(cx - 4, hy - 1, 11, 3, 0xf8f8f4);
  g.vline(cx - 4, hy + 1, hy + 4, 0xf8f8f4);
  for (const x of [cx - 2, cx + 1, cx + 4]) g.set(x, hy, 0x4a7ac8);
  g.set(cx + 6, hy + 2, 0xf8f8f4);
  g.set(cx + 7, hy + 3, 0xf8f8f4);
  g.set(cx + 7, hy + 1, 0xf8f8f4);
  if (snowy) {
    g.hline(cx - 5, cx + 5, by, 0xc83a3a);
    g.hline(cx - 4, cx + 4, by + 1, 0xa82a2a);
  }
  // 지팡이
  line(g, cx + 7, by + 6, cx + 9, base, 0x7a5432);
  g.set(cx + 6, by + 6, 0x7a5432);
  g.outline(OUT);
  shadow(g, cx + 1, H - 1.5, 7, 1.3, 64);
  return g;
}

// ════════════════════════ 싸리 울타리 (촌캉스 작은 집) ════════════════════════

/** 싸리 울타리 한 토막 (a → b, 바닥 선 기준). 원점 = (min x, min y - 높이) — ox·oy로 돌려준다 */
export function brushFenceSeg(ax: number, ay: number, bx: number, by: number, seed: number, snowy: boolean): { grid: Grid; ox: number; oy: number } {
  const HT = 11;
  const x0 = Math.floor(Math.min(ax, bx)) - 2;
  const y0 = Math.floor(Math.min(ay, by)) - HT - 2;
  const W = Math.ceil(Math.abs(bx - ax)) + 5;
  const Hh = Math.ceil(Math.abs(by - ay)) + HT + 5;
  const g = new Grid(W, Hh);
  const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
  const cols = [0xb08a5a, 0x8e6a40, 0xc8a46e, 0x9a7848] as const;
  const vert = Math.abs(bx - ax) < Math.abs(by - ay);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(ax + (bx - ax) * t) - x0;
    const y = Math.round(ay + (by - ay) * t) - y0;
    const post = i % 14 === 0 || i === n;
    const step = vert ? 1 : 2;
    if (post) {
      for (let k = 0; k < HT + 2; k++) {
        g.set(x, y - k, 0x5e4228);
        g.set(x + 1, y - k, 0x7a5634);
      }
      if (snowy) g.set(x, y - HT - 2, 0xf6f8fa);
    } else if (i % step === 0) {
      const h = HT - 2 + Math.floor(hash2(i, seed, 671) * 3);
      const c = cols[Math.floor(hash2(i, seed, 673) * 4)];
      for (let k = 0; k < h; k++) g.set(x, y - k, k === h - 1 ? lighten(c, 0.15) : c);
      if (snowy && hash2(i, seed, 675) < 0.5) g.set(x, y - h, 0xeef3f6);
    }
    // 엮은 새끼줄 두 가닥
    for (const k of [3, 7]) g.set(x, y - k, vert ? 0x6a4a2c : (i + k) % 3 === 0 ? 0xd8c090 : 0x6a4a2c);
  }
  g.outline(OUT);
  return { grid: g, ox: x0, oy: y0 };
}

// ════════════════════════ 7차: 집마다 다른 앞마당 단계 소품 ════════════════════════

/** 닭장 (나무 닭집 + 철망 마당 + 닭 둘) */
export function chickenCoopArt(snowy: boolean): Grid {
  const g = new Grid(34, 28);
  // 닭집 (왼쪽)
  g.rect(2, 10, 14, 14, WOOD.mid);
  for (let y = 10; y < 24; y += 3) g.hline(2, 15, y, WOOD.hi);
  g.rect(6, 16, 5, 8, 0x3a2a1c);
  for (let x = 0; x < 18; x++) {
    const y = 9 - Math.round(x * 0.35);
    for (let k = 0; k < 3; k++) g.set(x, y + k, k === 0 ? (snowy ? 0xf6f8fa : 0xc86a4a) : 0xa8543a);
  }
  // 철망 마당 (오른쪽)
  for (let x = 16; x < 33; x++) {
    g.set(x, 12, 0x8a8a92);
    g.set(x, 24, 0x8a8a92);
  }
  for (let x = 16; x < 33; x += 4) g.vline(x, 12, 24, 0x6a6a72);
  for (let y = 14; y < 24; y += 3) for (let x = 17; x < 33; x += 2) g.set(x, y, 0xb4b4bc, 120);
  // 닭 둘
  for (const [cx, cy] of [
    [22, 21],
    [28, 20],
  ] as const) {
    g.ellipse(cx, cy, 2.6, 2, 0xf8f4ea);
    g.set(cx + 2, cy - 2, 0xf8f4ea);
    g.set(cx + 2, cy - 3, 0xe04a3a);
    g.set(cx + 3, cy - 2, 0xf2b040);
    g.set(cx - 2, cy - 1, 0xe8e0d0);
  }
  g.outline(OUT);
  shadow(g, 17, 25.5, 16, 1.6, 50);
  return g;
}
/** 우물 (둥근 돌 우물 + 나무 지붕틀 + 두레박) */
export function wellArt(snowy: boolean): Grid {
  const g = new Grid(24, 30);
  g.ellipse(12, 23, 9, 5, STONE.mid);
  for (let x = 3; x < 22; x += 3) g.vline(x, 21, 27, STONE.lo);
  g.ellipse(12, 21, 7, 2.6, 0x2a3440);
  g.hline(6, 18, 19, STONE.hi);
  g.rect(3, 6, 2, 17, LOG.lo);
  g.rect(19, 6, 2, 17, LOG.lo);
  g.hline(3, 20, 9, LOG.mid);
  for (let x = 0; x < 24; x++) {
    const y = 5 - Math.round(Math.abs(x - 12) * 0.35);
    g.set(x, y, snowy ? 0xf6f8fa : 0xa8543a);
    g.set(x, y + 1, 0x8a4430);
  }
  g.vline(12, 10, 15, 0x6a4a2c);
  g.rect(10, 15, 5, 4, LOG.mid);
  g.hline(10, 14, 15, LOG.hi);
  g.outline(OUT);
  shadow(g, 12, 28, 10, 1.6, 50);
  return g;
}
/** 원두막 (기둥 위 높은 마루 + 짚 지붕 + 사다리 + 방석) */
export function wondumakArt(snowy: boolean, xmas: boolean): Grid {
  const g = new Grid(50, 52);
  for (const x of [5, 43]) g.rect(x, 18, 3, 32, LOG.lo);
  for (const x of [12, 36]) g.rect(x, 22, 2, 26, LOG.lo);
  // 마루
  g.rect(3, 30, 44, 6, WOOD.mid);
  for (let x = 3; x < 47; x += 4) g.vline(x, 30, 35, WOOD.lo);
  g.hline(3, 46, 30, WOOD.hi);
  g.hline(3, 46, 36, LOG.lo);
  // 방석
  for (const [x, c] of [
    [12, 0xc8484a],
    [24, 0x3e5a8a],
    [34, 0xd89a3a],
  ] as const)
    g.rect(x, 28, 5, 3, c);
  // 짚 지붕
  for (let y = 2; y < 18; y++) {
    const inset = Math.max(0, 9 - y);
    for (let x = inset; x < 50 - inset; x++) {
      const c = snowy && y < 6 ? 0xf2f6f8 : (x + y * 2) % 5 === 0 ? 0xa88a4a : y > 14 ? 0x9a7a3a : 0xc8a85a;
      g.set(x, y, c);
    }
  }
  if (xmas) for (let x = 2; x < 48; x += 4) g.set(x, 18, XMAS[(x / 4) % 5 | 0]);
  // 사다리
  g.vline(18, 36, 50, LOG.mid);
  g.vline(23, 36, 50, LOG.mid);
  for (let y = 39; y < 50; y += 3) g.hline(18, 23, y, LOG.hi);
  g.outline(OUT);
  shadow(g, 25, 49.5, 23, 2, 56);
  return g;
}
/** 선베드 (흰 쿠션 · 등받이 올린) */
export function loungerArt(color: Color): Grid {
  const g = new Grid(24, 14);
  g.rect(2, 7, 20, 3, 0xf4f0e8);
  g.hline(2, 21, 7, 0xffffff);
  for (let i = 0; i < 6; i++) g.rect(2 + i, 6 - i, 3, 2, i % 2 ? 0xf4f0e8 : color);
  g.rect(3, 10, 2, 3, 0x8a8a92);
  g.rect(19, 10, 2, 3, 0x8a8a92);
  g.rect(10, 8, 9, 1, color);
  g.outline(OUT);
  shadow(g, 12, 12.5, 11, 1.2, 50);
  return g;
}
