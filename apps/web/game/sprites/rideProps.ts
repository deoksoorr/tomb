import { darken, Grid, lighten, type Color } from "./pixel";

// 50번 조각배·광장 놀거리 픽셀아트 (코드 생성). 텍스처는 PlazaRides·BoatRide가 처음 쓸 때 등록한다 (ensureRideTextures).
//  - 조각배: 뒤 판(바닥·먼 뱃전·먼 노, 사람 뒤) + 앞 판(가까운 뱃전·가까운 노, 사람 앞)으로 나눠 앉은 사람의 다리를 가린다.
//    프레임 3장(노: 가운데 / 앞으로 / 뒤로). 뱃머리가 오른쪽인 그림과 왼쪽인 그림을 따로 만든다 (뒤집기 원점 문제 없이)
//  - 소원 분수 (물 반짝임 2프레임), 시소 받침·판, 트램펄린(눌림 2프레임), 회전목마 받침·지붕·목마

const OUT = 0x1f1d1a;
const WOOD = { hi: 0x9a7854, mid: 0x7d5e40, lo: 0x5c432d, line: 0x2e2219 };
const STONE = { hi: 0xb4b2a6, mid: 0x93918a, lo: 0x6e6c66, line: 0x3a3934 };
const WATER = { hi: 0x9fd0e6, mid: 0x5f9fc0, lo: 0x3f7898 };

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
}

// ── 조각배 ──
/** 프레임 높이와 앉은 사람 발 위치(원점 y, 위에서부터 px) */
export const BOAT_H = 26;
export const BOAT_FEET_Y = 18;
/** 프레임 폭: 1인승·2인승 */
export const boatW = (seats: 1 | 2) => (seats === 1 ? 36 : 46);
/** 노 젓는 사람 자리 x (프레임 왼쪽에서, 뱃머리가 오른쪽일 때) */
export const boatRowerX = (seats: 1 | 2) => (seats === 1 ? 18 : 28);
export const BOAT_FRAMES = 3;

/** 한 프레임: layer = back(바닥·먼 뱃전·먼 노·그림자) / front(가까운 뱃전·가까운 노) */
function boatFrame(seats: 1 | 2, layer: "back" | "front", frame: number, tint: Color): Grid {
  const W = boatW(seats);
  const g = new Grid(W, BOAT_H);
  const L = W - 4;
  const x0 = 2;
  const rx = boatRowerX(seats);
  const oar = frame === 1 ? 4 : frame === 2 ? -4 : 0;
  const hull = { hi: lighten(tint, 0.18), mid: tint, lo: darken(tint, 0.25), line: darken(tint, 0.62) };
  const prof = (i: number) => {
    const t = (i + 0.5 - L / 2) / (L / 2); // -1 고물 … +1 뱃머리
    return t > 0 ? Math.max(0, 1 - t ** 2.2) ** 0.7 : Math.max(0, 1 - (-t) ** 4) ** 0.5;
  };
  if (layer === "back") {
    // 그림자 (물 위)
    for (let i = 1; i < L - 1; i++) if (prof(i) > 0.25) g.set(x0 + i, BOAT_H - 1, 0x000000, 60);
    // 먼 노 (뱃전 위로 비스듬히)
    line(g, rx, 8, rx + oar - 2, 1, 0xb89a72);
    g.rect(rx + oar - 3, 0, 2, 2, 0x8a6a48);
    for (let i = 0; i < L; i++) {
      const f = prof(i);
      if (f <= 0.05) continue;
      const top = 10 - Math.round(2 * f);
      const x = x0 + i;
      g.vline(x, top, top + 1, hull.hi);
      // 바닥 (안쪽)
      for (let y = top + 2; y <= 14; y++) g.set(x, y, y === top + 2 ? WOOD.lo : (x + y) % 5 === 0 ? WOOD.lo : WOOD.mid);
    }
    // 가로 좌판
    const thwarts = seats === 1 ? [rx] : [rx, rx - 11];
    for (const tx of thwarts) g.rect(tx - 1, 10, 3, 5, WOOD.hi);
    g.outline(hull.line);
  } else {
    // 가까운 뱃전 (몸 앞을 가린다)
    for (let i = 0; i < L; i++) {
      const f = prof(i);
      if (f <= 0.05) continue;
      const x = x0 + i;
      const bot = 14 + Math.round(5 * f);
      for (let y = 14; y <= bot; y++) g.set(x, y, y === 14 ? hull.hi : y >= bot - 1 ? hull.lo : hull.mid);
      if (i % 6 === 3) g.set(x, 16, hull.lo);
    }
    // 가까운 노 (아래로 비스듬히)
    line(g, rx, 15, rx + oar + 2, 23, 0xc0a078);
    g.rect(rx + oar + 1, 23, 2, 2, 0x8a6a48);
    g.outline(hull.line);
  }
  return g;
}

/** 3프레임 시트 (뱃머리 오른쪽). mirror면 뱃머리 왼쪽 */
export function boatSheet(seats: 1 | 2, layer: "back" | "front", mirror: boolean, tint: Color): HTMLCanvasElement {
  const W = boatW(seats);
  const sheet = new Grid(W * BOAT_FRAMES, BOAT_H);
  for (let f = 0; f < BOAT_FRAMES; f++) {
    const fr = boatFrame(seats, layer, f, tint);
    sheet.draw(mirror ? fr.mirrored() : fr, f * W, 0);
  }
  return sheet.toCanvas();
}

/** 배 색 (배마다 조금씩) */
export const BOAT_TINTS: readonly Color[] = [0x8a5a3a, 0x5d6f86, 0x7a6a3a];

// ── 소원 분수 (52×46, 받침 = 수반 아래 가운데): 돌 수반 + 가운데 기둥 + 위 접시 + 물줄기. 프레임 2장(물 반짝임) ──
export const FOUNTAIN_W = 52;
export const FOUNTAIN_H = 46;
function fountainFrame(f: number): Grid {
  const g = new Grid(FOUNTAIN_W, FOUNTAIN_H);
  const cx = 26;
  // 그림자
  g.ellipse(cx, 42.5, 24, 3, 0x000000, 60);
  // 수반 (바깥 돌테)
  g.ellipse(cx, 36, 23, 8, STONE.mid);
  g.ellipse(cx, 35, 21, 6.5, STONE.hi);
  g.ellipse(cx, 35.5, 18.5, 5, WATER.mid);
  for (let x = 6; x <= 46; x++) for (let y = 38; y <= 43; y++) if (((x - cx) / 23) ** 2 + ((y - 36) / 8) ** 2 <= 1 && y >= 39) g.set(x, y, y > 41 ? STONE.lo : STONE.mid);
  // 물결 반짝임
  const glints = f === 0 ? [[16, 34], [30, 37], [36, 33]] : [[20, 36], [33, 34], [13, 36]];
  for (const [x, y] of glints) g.rect(x, y, 2, 1, WATER.hi);
  // 동전 몇 개
  for (const [x, y] of [[22, 37], [29, 35], [34, 37]]) g.set(x, y, 0xe8c45a);
  // 기둥
  g.rect(cx - 2, 16, 5, 19, STONE.mid);
  g.vline(cx - 2, 16, 34, STONE.hi);
  g.vline(cx + 2, 16, 34, STONE.lo);
  // 위 접시
  g.ellipse(cx, 16, 9, 3, STONE.hi);
  g.ellipse(cx, 15.5, 7, 2, WATER.mid);
  // 물줄기 (가운데 솟고 접시에서 흘러내림)
  const up = f === 0 ? 4 : 3;
  g.vline(cx, up, 14, WATER.hi);
  g.vline(cx + 1, up + 2, 14, WATER.mid);
  g.set(cx - 1, up + 1, WATER.hi);
  g.set(cx + 2, up + 1 + f, WATER.hi);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 14; k++) {
      const x = cx + s * (8 + Math.floor(k / 3));
      const y = 17 + k;
      if ((k + f) % 4 !== 3) g.set(x, y, k % 2 ? WATER.mid : WATER.hi);
    }
  }
  g.outline(OUT);
  return g;
}
export function fountainSheet(): HTMLCanvasElement {
  const sheet = new Grid(FOUNTAIN_W * 2, FOUNTAIN_H);
  for (let f = 0; f < 2; f++) sheet.draw(fountainFrame(f), f * FOUNTAIN_W, 0);
  return sheet.toCanvas();
}

// ── 시소: 받침(14×10, 받침 = 아래 가운데)과 판(46×5, 가운데를 축으로 돌린다) ──
export function seesawBase(): HTMLCanvasElement {
  const g = new Grid(14, 10);
  g.ellipse(7, 8.5, 6, 1.5, 0x000000, 60);
  // 세모 받침
  for (let y = 1; y <= 7; y++) g.hline(7 - Math.floor(y / 1.6), 7 + Math.floor(y / 1.6), y, y < 3 ? 0xc8604a : 0xa84a3a);
  g.set(7, 1, 0xe0e0d0);
  g.outline(OUT);
  return g.toCanvas();
}
export const SEESAW_PLANK_W = 46;
export function seesawPlank(): HTMLCanvasElement {
  const g = new Grid(SEESAW_PLANK_W, 6);
  g.rect(1, 2, SEESAW_PLANK_W - 2, 2, 0xd8a050);
  g.hline(1, SEESAW_PLANK_W - 2, 2, 0xf0c070);
  // 양 끝 손잡이·앉는 판
  for (const x of [4, SEESAW_PLANK_W - 5]) {
    g.rect(x - 2, 1, 5, 3, 0x6a8ac0);
    g.vline(x, 0, 1, 0x3a3a3a);
  }
  g.outline(OUT);
  return g.toCanvas();
}

// ── 트램펄린 (40×18, 받침 = 매트 가운데보다 아래 테두리): 파란 테 + 검은 매트, 프레임 2장(눌림) ──
export const TRAMP_W = 40;
export const TRAMP_H = 18;
function trampFrame(pressed: boolean): Grid {
  const g = new Grid(TRAMP_W, TRAMP_H);
  const cx = 20;
  g.ellipse(cx, 15.5, 18, 2.2, 0x000000, 60);
  // 다리
  for (const x of [6, 14, 26, 34]) g.vline(x, 9, 14, 0x707780);
  // 테 (스프링 쿠션)
  g.ellipse(cx, 8, 19, 6.5, 0x3a78c8);
  g.ellipse(cx, 8, 17, 5, 0x5a9ae0);
  // 매트
  g.ellipse(cx, pressed ? 9 : 8, 14, 4, 0x26262c);
  if (!pressed) g.hline(cx - 6, cx + 2, 6, 0x4a4a56);
  else g.ellipse(cx, 9.5, 6, 1.5, 0x18181c);
  g.outline(OUT);
  return g;
}
export function trampolineSheet(): HTMLCanvasElement {
  const sheet = new Grid(TRAMP_W * 2, TRAMP_H);
  sheet.draw(trampFrame(false), 0, 0);
  sheet.draw(trampFrame(true), TRAMP_W, 0);
  return sheet.toCanvas();
}

// ── 회전목마 ──
/** 받침 원판 (70×28, 바닥 장식 높이에 깐다. 가운데 = 받침 가운데) */
export function carouselFloor(): HTMLCanvasElement {
  const g = new Grid(70, 28);
  g.ellipse(35, 15, 34, 12.5, 0x000000, 50);
  g.ellipse(35, 13, 34, 12, 0xa0563c);
  g.ellipse(35, 12.5, 31, 10, 0xd8b884);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    line(g, 35, 12, Math.round(35 + Math.cos(a) * 30), Math.round(12.5 + Math.sin(a) * 9.5), 0xc8a470);
  }
  g.ellipse(35, 12.5, 6, 2.5, 0xb88a5a);
  g.outline(OUT);
  return g.toCanvas();
}
/**
 * 지붕 (64×66, 받침 = 아래 가운데 = 받침 원판 가운데). 지붕은 사람들 앞에 그린다.
 * 가운데 기둥은 carouselPole로 따로 — 받침 가운데 y 깊이로 그려 앞쪽으로 도는 목마·사람이 기둥 앞에 보인다 (F15)
 */
export const CAROUSEL_TOP_W = 64;
export const CAROUSEL_TOP_H = 66;
export function carouselTop(): HTMLCanvasElement {
  const g = new Grid(CAROUSEL_TOP_W, CAROUSEL_TOP_H);
  const cx = 32;
  // 지붕 (줄무늬 원뿔) — 바닥 테가 y≈22
  for (let y = 4; y <= 22; y++) {
    const half = Math.round(3 + (y - 4) * 1.55);
    for (let x = cx - half; x <= cx + half; x++) {
      const stripe = Math.floor(((x - cx) / Math.max(1, half)) * 4 + 4) % 2 === 0;
      g.set(x, y, stripe ? 0xe05a4a : 0xf2e2c4);
    }
  }
  // 지붕 아래 술 장식
  for (let x = cx - 30; x <= cx + 30; x++) {
    g.set(x, 23, 0xd8b850);
    if (x % 4 === 0) g.set(x, 24, 0xe05a4a);
  }
  // 꼭대기 깃발
  g.vline(cx, 0, 4, 0x6a5a4a);
  g.rect(cx + 1, 0, 4, 2, 0xf0c040);
  g.outline(OUT);
  return g.toCanvas();
}

/** 가운데 기둥 (지붕과 같은 64×66 칸·같은 원점: 지붕 아래 술 장식 밑에서 원판 가운데까지) */
export function carouselPole(): HTMLCanvasElement {
  const g = new Grid(CAROUSEL_TOP_W, CAROUSEL_TOP_H);
  const cx = 32;
  g.rect(cx - 1, 25, 3, CAROUSEL_TOP_H - 26, 0xd8c070);
  g.vline(cx - 1, 25, CAROUSEL_TOP_H - 2, 0xf0dc90);
  g.outline(OUT);
  return g.toCanvas();
}
/** 목마 (16×16, 받침 = 아래 가운데. 오른쪽을 본다): 몸통 + 머리 + 장대. variant마다 색 */
export const HORSE_COLORS: readonly Color[] = [0xf2ead8, 0xe0b070, 0xc8d8f0, 0xe8b0c0];
export function horse(color: Color, mirror: boolean): HTMLCanvasElement {
  const g = new Grid(16, 16);
  // 장대 (지붕까지 이어지는 금색 기둥의 아랫부분)
  g.vline(8, 0, 13, 0xe8c860);
  // 몸통
  g.rect(3, 7, 9, 4, color);
  g.hline(3, 11, 7, lighten(color, 0.25));
  // 머리·목
  g.rect(11, 4, 2, 4, color);
  g.rect(12, 3, 3, 3, color);
  g.set(14, 4, 0x2a2420);
  // 갈기·꼬리
  g.vline(11, 3, 6, 0x8a5a3a);
  g.vline(2, 7, 10, 0x8a5a3a);
  // 다리 (앞뒤로 뻗은 자세)
  line(g, 4, 11, 2, 13, darken(color, 0.25));
  line(g, 11, 11, 13, 13, darken(color, 0.25));
  // 안장
  g.rect(6, 6, 3, 2, 0xc84a3a);
  g.outline(OUT);
  return (mirror ? g.mirrored() : g).toCanvas();
}

// ── 텍스처 키 ──
export const RIDE_TEX = {
  boatBack: (seats: 1 | 2, left: boolean, v: number) => `ride-boat${seats}-back-${left ? "l" : "r"}-${v}`,
  boatFront: (seats: 1 | 2, left: boolean, v: number) => `ride-boat${seats}-front-${left ? "l" : "r"}-${v}`,
  fountain: "ride-fountain",
  seesawBase: "ride-seesaw-base",
  seesawPlank: "ride-seesaw-plank",
  trampoline: "ride-trampoline",
  carouselFloor: "ride-carousel-floor",
  carouselTop: "ride-carousel-top",
  carouselPole: "ride-carousel-pole",
  horse: (v: number, left: boolean) => `ride-horse-${v}-${left ? "l" : "r"}`,
} as const;
