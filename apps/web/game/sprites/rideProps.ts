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

// ── 11/16 조각배 앞·뒷모습 (위아래로 저을 때) ──
// 비스듬히 내려다본 배: 열린 속(바닥·안쪽 벽·좌판, 뒤 판)과 가까운 끝의 바깥 벽(앞 판 — 가까운 자리 사람의 다리를 가린다).
// down = 뱃머리가 화면 아래(나를 향해 온다) — 뾰족한 이물이 앞에, up = 뱃머리가 위(멀어진다) — 넓은 고물이 앞에.
// 노는 양옆으로 뻗고 프레임 1·2에서 노깃이 앞뒤(화면 위아래)로 젓는다. 앞모습은 노가 사람 앞(손에 쥔 채), 뒷모습은 사람 뒤(몸에 가린다).
// 2인승 뒷자리는 노 젓는 자리에서 세로로 BOAT_BACK_SEAT_Y (앞모습 = 위, 뒷모습 = 아래)
/** 앞·뒷모습 2인승 뒷자리 세로 거리 (옆모습 BOAT_BACK_SEAT보다 짧게 — 위에서 내려다보니 깊이가 줄어든다) */
export const BOAT_BACK_SEAT_Y = 10;
/** 앞·뒷모습 프레임 폭 (노 끝까지)·가운데 */
export const BOAT_VW = 33;
const BOAT_VCX = 16;
/** 배 몸통 반폭 */
const BOAT_VHW = 8;
/** 앞·뒷모습 프레임 높이 */
export const boatVH = (seats: 1 | 2) => (seats === 1 ? 34 : 41);
/** 노 젓는 사람 발 위치 (위에서부터 px). 2인승 앞모습은 뒷자리가 위에 있어 그만큼 아래로 */
export const boatVFeetY = (seats: 1 | 2, down: boolean) => (seats === 1 ? 26 : down ? 29 : 25);

function boatVFrame(seats: 1 | 2, layer: "back" | "front", down: boolean, frame: number, tint: Color): Grid {
  const H = boatVH(seats);
  const g = new Grid(BOAT_VW, H);
  const fy = boatVFeetY(seats, down);
  const gap = seats === 2 ? BOAT_BACK_SEAT_Y : 0;
  // 가까운 자리·먼 자리 발 (1인승은 같다)
  const nearY = down ? fy : fy + gap;
  const farY = down ? fy - gap : fy;
  const cx = BOAT_VCX;
  const hull = { hi: lighten(tint, 0.18), mid: tint, lo: darken(tint, 0.25), line: darken(tint, 0.62) };
  // x마다: 열린 속의 먼 끝(top)·가까운 끝(bot), 가까운 바깥 벽 아래 끝(wall). u = -1(왼쪽 뱃전) … 1(오른쪽)
  // down: 먼 끝 = 둥근 고물, 가까운 끝 = 뾰족한 이물(V) / up: 먼 끝 = 뾰족한 이물, 가까운 끝 = 넓은 고물
  const top = (u: number) => (down ? farY - 18 + Math.round(3 * u * u) : farY - 24 + Math.round(12 * Math.abs(u) ** 1.3));
  const bot = (u: number) => (down ? nearY - 3 - Math.round(3 * Math.abs(u) ** 1.2) : nearY - 3 - Math.round(2 * u * u));
  const wall = (u: number) => (down ? nearY + 6 - Math.round(7 * Math.abs(u) ** 1.1) : nearY + 4 - Math.round(2 * u * u));
  const seatsY = seats === 1 ? [fy] : [nearY, farY];
  // 노: 노 젓는 사람 손 높이에서 양옆으로. 노깃은 프레임 1 = 뱃머리 쪽, 2 = 고물 쪽 (down이면 뱃머리가 아래)
  const oy = fy - 6;
  const sweep = frame === 1 ? 3 : frame === 2 ? -3 : 0;
  const tipDy = down ? sweep : -sweep;
  const oars = () => {
    for (const s of [-1, 1]) {
      const x0 = cx + s * 4;
      const x1 = cx + s * (BOAT_VHW + 8);
      line(g, x0, oy, x1, oy + 2 + tipDy, s < 0 ? 0xb89a72 : 0xc0a078);
      g.rect(s < 0 ? x1 - 1 : x1, oy + 1 + tipDy, 2, 3, 0x8a6a48);
    }
  };
  if (layer === "back") {
    for (let x = cx - BOAT_VHW; x <= cx + BOAT_VHW; x++) {
      const u = (x - cx) / BOAT_VHW;
      const t = top(u);
      const b = bot(u);
      // 그림자 (물 위, 바깥 벽 아래)
      g.set(x, wall(u) + 1, 0x000000, 60);
      // 먼 뱃전 테 → 안쪽 벽(두 줄) → 바닥 (세로 판자)
      for (let y = t; y <= b; y++) {
        const edge = x === cx - BOAT_VHW || x === cx + BOAT_VHW;
        g.set(x, y, y === t || edge ? hull.hi : y <= t + 2 ? hull.lo : (x - cx + 9) % 4 === 0 ? WOOD.lo : WOOD.mid);
      }
    }
    // 가로 좌판 (앉은 사람 엉덩이 높이)
    for (const sy of seatsY) g.rect(cx - BOAT_VHW + 1, sy - 5, BOAT_VHW * 2 - 1, 2, WOOD.hi);
    // 뒷모습: 노는 사람 몸 뒤 (앞으로 내민 손에 쥐어 몸에 가린다)
    if (!down) oars();
    g.outline(hull.line);
  } else {
    // 가까운 끝 바깥 벽 (몸 앞을 가린다): 위 테는 밝게, 아래로 갈수록 어둡게
    for (let x = cx - BOAT_VHW; x <= cx + BOAT_VHW; x++) {
      const u = (x - cx) / BOAT_VHW;
      const b = bot(u);
      const w = wall(u);
      for (let y = b; y <= w; y++) g.set(x, y, y === b ? hull.hi : y >= w - 1 ? hull.lo : hull.mid);
      if ((x - cx + 9) % 5 === 2 && b + 2 < w) g.set(x, b + 2, hull.lo);
    }
    // 앞모습: 노는 사람 앞 (양손에 쥔다)
    if (down) oars();
    g.outline(hull.line);
  }
  return g;
}

/** 앞·뒷모습 3프레임 시트 (노: 가운데 / 뱃머리 쪽 / 고물 쪽). down = 뱃머리가 화면 아래 */
export function boatVSheet(seats: 1 | 2, layer: "back" | "front", down: boolean, tint: Color): HTMLCanvasElement {
  const sheet = new Grid(BOAT_VW * BOAT_FRAMES, boatVH(seats));
  for (let f = 0; f < BOAT_FRAMES; f++) sheet.draw(boatVFrame(seats, layer, down, f, tint), f * BOAT_VW, 0);
  return sheet.toCanvas();
}

/** 조각배 한 프레임 Grid (미리보기용). dir: 0 아래 · 1 왼쪽 · 2 오른쪽 · 3 위 (DIR) */
export function boatGrid(seats: 1 | 2, layer: "back" | "front", dir: number, frame: number, tint: Color): Grid {
  if (dir === 0 || dir === 3) return boatVFrame(seats, layer, dir === 0, frame, tint);
  const g = boatFrame(seats, layer, frame, tint);
  return dir === 1 ? g.mirrored() : g;
}

/** 조각배 그림 크기와 노 젓는 사람 발(원점) 픽셀 — 방향별 (dir: DIR) */
export function boatGeom(seats: 1 | 2, dir: number): { w: number; h: number; ax: number; ay: number } {
  if (dir === 0 || dir === 3) return { w: BOAT_VW, h: boatVH(seats), ax: BOAT_VCX, ay: boatVFeetY(seats, dir === 0) };
  const W = boatW(seats);
  const rx = boatRowerX(seats);
  return { w: W, h: BOAT_H, ax: dir === 1 ? W - rx - 1 : rx, ay: BOAT_FEET_Y };
}

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
  // 지붕 아래 술 장식 (y=23 줄 = 받침 가운데에서 rides.CAROUSEL_ROOF_DROP 위. 목마 기둥 윗끝이 여기 숨는다)
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

/**
 * 가운데 기둥 (지붕과 같은 64×66 칸·같은 원점: 지붕 안쪽에서 원판 가운데까지).
 * 윗끝을 지붕 술 장식 위(지붕이 덮는 곳)까지 올려 기둥 끝 테두리가 보이지 않게 — 늘 지붕에 붙어 보인다
 */
export function carouselPole(): HTMLCanvasElement {
  const g = new Grid(CAROUSEL_TOP_W, CAROUSEL_TOP_H);
  const cx = 32;
  g.rect(cx - 1, 20, 3, CAROUSEL_TOP_H - 21, 0xd8c070);
  g.vline(cx - 1, 20, CAROUSEL_TOP_H - 2, 0xf0dc90);
  g.outline(OUT);
  return g.toCanvas();
}
/**
 * 목마 (24×16, 받침 = 아래 가운데. 오른쪽을 보는 옆모습, mirror면 왼쪽): 몸통 + 휜 목 + 머리 + 앞뒤로 뻗은 다리 + 안장. variant마다 색.
 * 기둥은 그리지 않는다 — 지붕까지 이어지는 목마 기둥(horsePole)을 목마 뒤에 따로 세운다. 안장 가운데 = 기둥 자리(x 11~12)
 */
export const HORSE_W = 24;
export const HORSE_H = 16;
export const HORSE_COLORS: readonly Color[] = [0xf2ead8, 0xe0b070, 0xc8d8f0, 0xe8b0c0];
export function horse(color: Color, mirror: boolean): HTMLCanvasElement {
  const g = new Grid(HORSE_W, HORSE_H);
  const hi = lighten(color, 0.25);
  const lo = darken(color, 0.18);
  const leg = darken(color, 0.28);
  const mane = 0x8a5a3a;
  // 꼬리 (뒤로 흩날린다)
  line(g, 5, 7, 2, 10, mane);
  line(g, 5, 8, 3, 11, mane);
  g.set(1, 11, mane);
  // 다리: 뒷다리는 뒤로, 앞다리는 앞으로 접어 뻗은 회전목마 자세
  line(g, 7, 10, 4, 13, leg);
  line(g, 8, 10, 7, 13, leg);
  line(g, 15, 10, 18, 12, leg);
  line(g, 16, 10, 19, 11, leg);
  g.set(19, 12, leg);
  for (const [x, y] of [[4, 13], [7, 13], [18, 13], [20, 11]] as const) g.set(x, y, 0x3a3028);
  // 몸통
  g.ellipse(11.5, 8.5, 6.5, 2.6, color);
  g.hline(7, 15, 6, hi);
  g.hline(8, 15, 10, lo);
  // 목 (앞으로 휘어 올라간다)
  g.rect(15, 4, 3, 4, color);
  g.rect(16, 2, 3, 3, color);
  g.set(15, 4, hi);
  // 머리 (주둥이는 앞 아래로)
  g.rect(18, 2, 3, 3, color);
  g.rect(20, 3, 2, 2, color);
  g.set(21, 4, lo);
  g.set(17, 1, color); // 귀
  g.set(19, 2, 0x2a2420); // 눈
  // 갈기
  g.set(16, 1, mane);
  g.vline(15, 2, 3, mane);
  g.vline(14, 4, 5, mane);
  // 굴레 (금줄)
  g.set(20, 4, 0xd8b850);
  // 안장 + 안장 깔개
  g.rect(10, 5, 4, 2, 0xc84a3a);
  g.hline(10, 13, 5, 0xe06a58);
  g.hline(9, 14, 7, 0xd8b850);
  g.outline(OUT);
  return (mirror ? g.mirrored() : g).toCanvas();
}

/** 목마 기둥 (4×HORSE_POLE_H, 받침 = 아래 가운데): 금빛 꽈배기 막대. 그릴 때 위를 잘라(setCrop) 지붕 술 장식에서 바닥까지만 보인다 */
export const HORSE_POLE_W = 4;
export const HORSE_POLE_H = 60;
export function horsePole(): HTMLCanvasElement {
  const g = new Grid(HORSE_POLE_W, HORSE_POLE_H);
  for (let y = 0; y < HORSE_POLE_H; y++) {
    const twist = y % 4 < 2;
    g.set(1, y, twist ? 0xf6e2a0 : 0xe0c060);
    g.set(2, y, twist ? 0xc8a040 : 0xb08a30);
  }
  g.vline(0, 0, HORSE_POLE_H - 1, OUT);
  g.vline(3, 0, HORSE_POLE_H - 1, OUT);
  return g.toCanvas();
}

// ── 11/15 오리배 (오리 연못) ── 노란·흰 오리 몸통 + 큰 오리 머리(주황 부리)·작은 차양 지붕·나란한 두 자리·고물 물레바퀴.
// 조각배처럼 뒤 판(바닥·좌석·차양 기둥, 사람 뒤) + 앞 판(가까운 뱃전·날개·물레바퀴·머리·지붕, 사람 앞)으로 나눠 앉은 사람의 다리를 가린다.
// 프레임 3장 = 물레바퀴 날개 돌기. 뱃머리(머리)가 오른쪽인 그림, mirror면 왼쪽. 두 자리는 늘 화면 왼쪽(조종)·오른쪽(옆자리)
export const DUCK_W = 46;
export const DUCK_H = 38;
/** 앉은 사람 발 위치 (위에서부터 px) */
export const DUCK_FEET_Y = 26;
/** 왼쪽 자리 x (뱃머리가 오른쪽일 때. 옆자리는 + DUCK_SIDE_SEAT) — 두 자리 가운데가 차양 가운데 */
export const DUCK_SEAT_X = 13;
export const DUCK_FRAMES = 3;
export type DuckStyle = { body: Color; canopy: Color };
/** 배마다 몸 색·차양 줄무늬 색 (노랑+빨강 / 하양+파랑 / 노랑+분홍) */
export const DUCK_STYLES: readonly DuckStyle[] = [
  { body: 0xf7d046, canopy: 0xe0524a },
  { body: 0xf4f1e8, canopy: 0x4a8fd8 },
  { body: 0xf7d046, canopy: 0xee86ae },
];
const BEAK = { hi: 0xffb04a, mid: 0xf08a24, lo: 0xc0601a };
const CUSHION = { hi: 0x8cc8ec, mid: 0x5a9ccc };

function duckFrame(layer: "back" | "front", frame: number, st: DuckStyle): Grid {
  const g = new Grid(DUCK_W, DUCK_H);
  const body = { hi: lighten(st.body, 0.45), mid: st.body, lo: darken(st.body, 0.16), dk: darken(st.body, 0.32), line: darken(st.body, 0.66) };
  const white = lighten(st.body, 0.75);
  // 몸통 가로 범위: 고물(왼쪽) X0 … 뱃머리 X1, 두 자리 가운데 = DUCK_SEAT_X + 6
  const X0 = 3;
  const X1 = 37;
  const prof = (x: number) => {
    const t = (x + 0.5 - X0) / (X1 - X0);
    if (t < 0 || t > 1) return 0;
    return t < 0.2 ? Math.sqrt(1 - ((0.2 - t) / 0.2) ** 2) : t > 0.8 ? Math.sqrt(1 - ((t - 0.8) / 0.2) ** 2) : 1;
  };
  const RIM = 23; // 뱃전 윗줄
  const BOT = 33; // 몸통 아래 (물에 잠기는 쪽)
  const POSTS = [5, 31];
  if (layer === "back") {
    // 물 위 그림자
    for (let x = X0 + 2; x <= X1 - 2; x++) g.set(x, DUCK_H - 2, 0x000000, 55);
    for (let x = X0 + 5; x <= X1 - 5; x++) g.set(x, DUCK_H - 1, 0x000000, 28);
    // 먼 뱃전 (안쪽이 보이는 띠) + 물빛 바닥
    for (let x = X0; x <= X1; x++) {
      const f = prof(x);
      if (f <= 0.05) continue;
      const top = RIM - 2 - Math.round(1.5 * f);
      g.set(x, top, body.hi);
      g.set(x, top + 1, body.lo);
      for (let y = top + 2; y <= RIM + 2; y++) g.set(x, y, (x + y) % 5 === 0 ? 0x8fd0d8 : 0xa8dce2);
    }
    // 꼬리 깃 (고물 위로 살짝 들린)
    g.rect(1, 17, 3, 4, body.mid);
    g.rect(0, 15, 2, 3, body.mid);
    g.set(0, 15, body.hi);
    g.hline(1, 3, 17, body.hi);
    // 나란한 두 자리: 등받이 쿠션 (사람 뒤)
    for (const sx of [DUCK_SEAT_X, DUCK_SEAT_X + 12]) {
      g.rect(sx - 4, 18, 8, 6, CUSHION.mid);
      g.hline(sx - 4, sx + 3, 18, CUSHION.hi);
    }
    // 차양 기둥 (뒤)
    for (const px of POSTS) g.vline(px, 5, RIM, 0xc8bea8);
    g.outline(body.line);
  } else {
    // 가까운 뱃전 (몸 앞을 가린다): 위는 흰 테, 아래로 갈수록 어둡게
    for (let x = X0; x <= X1; x++) {
      const f = prof(x);
      if (f <= 0.05) continue;
      const top = RIM + Math.round((1 - f) * 4);
      const bot = BOT - Math.round((1 - f) * 3);
      for (let y = top; y <= bot; y++) g.set(x, y, y === top ? white : y === top + 1 ? body.hi : y >= bot - 1 ? body.dk : y >= bot - 2 ? body.lo : body.mid);
    }
    // 날개 (몸통 옆구리, 깃 끝 세 겹)
    const wx = 21;
    const wy = 27;
    g.ellipse(wx, wy + 1, 7.5, 3, body.lo);
    g.ellipse(wx + 1, wy, 6.5, 2.2, body.hi);
    g.ellipse(wx + 1, wy + 0.4, 6, 1.7, body.mid);
    for (const fx of [wx - 6, wx - 3]) g.set(fx, wy + 2, body.dk);
    // 물결선 (몸통 아랫단, 프레임마다 흐른다)
    for (let x = X0 + 3; x <= X1 - 3; x++) if ((x + frame) % 4 === 0) g.set(x, BOT - 1, 0x9fd0e6, 170);
    // 고물 물레바퀴 (흰 테 + 빨간 날개깃 셋, 프레임마다 20°씩)
    const cx = 7;
    const cy = 28;
    for (let y = cy - 4; y <= cy + 4; y++)
      for (let x = cx - 4; x <= cx + 4; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 4.3) g.set(x, y, d > 3.2 ? 0xf4f0e6 : 0x4a5a6a);
      }
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3 + (frame * Math.PI) / 9;
      const ex = Math.cos(a) * 2.8;
      const ey = Math.sin(a) * 2.8;
      line(g, Math.round(cx - ex), Math.round(cy - ey), Math.round(cx + ex), Math.round(cy + ey), 0xe2604a);
    }
    g.set(cx, cy, 0xfaf6ec);
    // 목 + 큰 머리 (뱃머리)
    for (let y = 13; y <= RIM + 1; y++) {
      const w = y < 18 ? 2 : 2 + Math.round((y - 18) * 0.5);
      for (let x = 35 - w; x <= 37; x++) g.set(x, y, x === 35 - w ? body.lo : body.mid);
    }
    g.vline(36, 14, 20, body.hi);
    g.ellipse(37, 9, 5.6, 5.2, body.mid);
    g.ellipse(36, 7.8, 3.6, 3.2, body.hi);
    g.ellipse(37.3, 9.3, 5, 4.6, body.mid);
    // 삐친 깃털 한 가닥
    g.set(36, 4, body.mid);
    g.set(37, 3, body.mid);
    g.set(38, 3, body.mid);
    // 눈 (반짝)·볼
    g.rect(38, 7, 2, 2, 0x1f1d1a);
    g.set(38, 7, 0xffffff);
    g.set(39, 11, 0xf2a0a0);
    // 부리 (주황, 오른쪽으로 납작하게)
    g.rect(42, 9, 3, 2, BEAK.mid);
    g.hline(42, 44, 8, BEAK.hi);
    g.hline(42, 43, 11, BEAK.lo);
    g.set(45, 9, BEAK.mid);
    // 지붕 (줄무늬 차양, 끝단이 물결)
    const R0 = 3;
    const R1 = 33;
    for (let x = R0; x <= R1; x++) {
      const stripe = Math.floor((x - R0) / 3) % 2 === 0 ? st.canopy : 0xfaf6ec;
      g.vline(x, 2, 4, stripe);
      if ((x - R0) % 3 !== 2) g.set(x, 5, stripe);
    }
    g.hline(R0 + 1, R1 - 1, 1, lighten(st.canopy, 0.35));
    g.set(18, 0, st.canopy);
    // 앞 기둥 꼭대기 (지붕 바로 아래)
    for (const px of POSTS) g.vline(px, 5, 6, 0xd8d0c0);
    g.outline(body.line);
    g.recolor((x, y) => x >= 41 && y >= 7 && y <= 12 && g.get(x, y) === Grid.rgba(body.line), darken(BEAK.lo, 0.35));
    g.recolor((x, y) => y <= 6 && g.get(x, y) === Grid.rgba(body.line), darken(st.canopy, 0.55));
  }
  return g;
}

/** 오리배 한 프레임 Grid (테스트·미리보기용). mirror면 뱃머리 왼쪽 */
export function duckGrid(layer: "back" | "front", frame: number, style: DuckStyle, mirror = false): Grid {
  const g = duckFrame(layer, frame, style);
  return mirror ? g.mirrored() : g;
}

/** 3프레임 시트 (물레바퀴). mirror면 뱃머리 왼쪽 */
export function duckSheet(layer: "back" | "front", mirror: boolean, style: DuckStyle): HTMLCanvasElement {
  const sheet = new Grid(DUCK_W * DUCK_FRAMES, DUCK_H);
  for (let f = 0; f < DUCK_FRAMES; f++) sheet.draw(duckGrid(layer, f, style, mirror), f * DUCK_W, 0);
  return sheet.toCanvas();
}

// ── 11/16 오리배 앞·뒷모습 (위아래로 저을 때) ── 두 자리는 그대로 나란히(왼쪽 = 조종, 오른쪽 + DUCK_SIDE_SEAT), 가운데가 몸통 가운데.
// down(앞모습) = 오리 머리가 나를 본다: 두 사람 사이 앞에 목·머리(눈 둘·부리), 가슴 벽이 다리를 가린다. 물결선이 프레임마다 흐른다.
// up(뒷모습) = 머리가 멀리: 지붕 너머로 뒤통수·목, 앞에는 등받이 쿠션·고물·꼬리 깃·물레바퀴 (프레임마다 날개깃이 아래로 돈다)
export const DUCK_VW = 40;
export const DUCK_VH = 42;
/** 앞·뒷모습 앉은 사람 발 위치 (뒷모습 머리가 지붕 위로 보이게 위쪽을 넉넉히) */
export const DUCK_VFEET_Y = 33;
/** 앞·뒷모습 왼쪽 자리 x (옆자리는 + 12) — 두 자리 가운데가 몸통 가운데 */
export const DUCK_VSEAT_X = 14;
const DUCK_VCX = DUCK_VSEAT_X + 6;
/** 몸통 반폭 (몸통 판정 DUCK_HULL_HALF보다 조금 좁게) */
const DUCK_VHW = 16;

function duckVFrame(layer: "back" | "front", down: boolean, frame: number, st: DuckStyle): Grid {
  const g = new Grid(DUCK_VW, DUCK_VH);
  const body = { hi: lighten(st.body, 0.45), mid: st.body, lo: darken(st.body, 0.16), dk: darken(st.body, 0.32), line: darken(st.body, 0.66) };
  const white = lighten(st.body, 0.75);
  const fy = DUCK_VFEET_Y;
  const cx = DUCK_VCX;
  const HW = DUCK_VHW;
  // x마다: 열린 속 먼 끝(top)·가까운 끝(bot, 가까운 벽 위 테), 가까운 벽 아래 끝(wall). 앞모습 가까운 끝 = 둥근 가슴, 뒷모습 = 고물
  const top = (u: number) => fy - 11 + Math.round(3 * u * u);
  const bot = (u: number) => fy - 4 - Math.round((down ? 3 : 2) * u * u);
  const wall = (u: number) => fy + (down ? 6 : 5) - Math.round(3 * u ** 4);
  const span = (fn: (x: number, u: number) => void) => {
    for (let x = cx - HW; x <= cx + HW; x++) {
      const u = (x - cx) / HW;
      if (Math.abs(u) > 0.94 && (x === cx - HW || x === cx + HW)) continue; // 모서리 둥글게
      fn(x, u);
    }
  };
  const seats = [DUCK_VSEAT_X, DUCK_VSEAT_X + 12];
  const cushions = (y0: number) => {
    for (const sx of seats) {
      g.rect(sx - 4, y0, 8, 6, CUSHION.mid);
      g.hline(sx - 4, sx + 3, y0, CUSHION.hi);
    }
  };
  // 차양 기둥: 먼 쪽(뒤 판)은 조금 안쪽, 가까운 쪽(앞 판)은 바깥
  const ROOF_Y = fy - 21; // 지붕 아랫단 (옆모습과 같은 높이)
  const roof = () => {
    const R0 = cx - 17;
    const R1 = cx + 17;
    for (let x = R0; x <= R1; x++) {
      const stripe = Math.floor((x - R0) / 3) % 2 === 0 ? st.canopy : 0xfaf6ec;
      // 윗면(내려다보여 밝게) 두 줄 + 앞 드림 세 줄 + 물결 끝단
      g.vline(x, ROOF_Y - 5, ROOF_Y - 4, x === R0 || x === R1 ? lighten(st.canopy, 0.2) : lighten(stripe, 0.3));
      g.vline(x, ROOF_Y - 3, ROOF_Y - 1, stripe);
      if ((x - R0) % 3 !== 2) g.set(x, ROOF_Y, stripe);
    }
    g.set(cx, ROOF_Y - 6, st.canopy);
  };
  if (layer === "back") {
    // 물 위 그림자
    span((x, u) => {
      g.set(x, wall(u) + 1, 0x000000, 55);
      if (Math.abs(u) < 0.8) g.set(x, wall(u) + 2, 0x000000, 28);
    });
    // 먼 뱃전 테 → 안쪽 벽 → 물빛 바닥 (옆 뱃전은 흰 테)
    span((x, u) => {
      const t = top(u);
      for (let y = t; y <= bot(u) + 1; y++) {
        const edge = Math.abs(u) > 0.9;
        g.set(x, y, y === t || edge ? body.hi : y === t + 1 ? body.lo : (x + y) % 5 === 0 ? 0x8fd0d8 : 0xa8dce2);
      }
    });
    if (down) {
      // 고물 꼬리 깃 (먼 뱃전 위로 살짝)
      g.rect(cx - 2, fy - 15, 4, 4, body.mid);
      g.hline(cx - 1, cx, fy - 16, body.mid);
      g.hline(cx - 2, cx + 1, fy - 15, body.hi);
      // 등받이 쿠션 (사람 뒤)
      cushions(fy - 10);
    } else {
      // 멀어진 목·뒤통수 (지붕 너머로 보인다)
      for (let y = fy - 27; y <= fy - 10; y++) g.hline(cx - 2, cx + 2, y, y < fy - 24 ? body.mid : body.lo);
      g.vline(cx, fy - 24, fy - 11, body.mid);
      g.ellipse(cx, fy - 28, 4.6, 4.2, body.mid);
      g.ellipse(cx - 0.5, fy - 29.5, 3, 2.2, body.hi);
      // 뒤통수 아랫단 그늘 · 삐친 깃털 한 가닥
      g.hline(cx - 3, cx + 3, fy - 25, body.lo);
      g.set(cx, fy - 33, body.mid);
      g.set(cx + 1, fy - 34, body.mid);
    }
    // 먼 차양 기둥
    for (const px of [cx - 14, cx + 14]) g.vline(px, ROOF_Y, fy - 10, 0xc8bea8);
    g.outline(body.line);
  } else {
    if (!down) cushions(fy - 8); // 뒷모습: 등받이가 사람 앞 (허리까지 가린다)
    // 가까운 벽 (앞모습 = 가슴, 뒷모습 = 고물): 위 흰 테, 아래로 갈수록 어둡게
    span((x, u) => {
      const b = bot(u);
      const w = wall(u);
      for (let y = b; y <= w; y++) g.set(x, y, y === b ? white : y === b + 1 ? body.hi : y >= w - 1 ? body.dk : y >= w - 2 ? body.lo : body.mid);
    });
    // 양 옆구리 날개 (깃 끝 두 겹)
    for (const s of [-1, 1]) {
      const wx = cx + s * (HW - 2);
      g.ellipse(wx, fy - 1, 2.6, 4.6, body.lo);
      g.ellipse(wx - s * 0.4, fy - 1.6, 1.8, 3.6, body.hi);
      g.set(wx, fy + 3, body.dk);
    }
    // 물결선 (몸통 아랫단, 프레임마다 흐른다)
    span((x, u) => {
      if (Math.abs(u) < 0.85 && (x + frame) % 4 === 0) g.set(x, wall(u) - 1, 0x9fd0e6, 170);
    });
    if (down) {
      // 목 + 큰 머리 (두 사람 사이 앞, 가슴에서 올라온다) — 눈 둘·볼·부리가 나를 본다
      for (let y = fy - 8; y <= bot(0) + 1; y++) g.hline(cx - 2, cx + 1, y, body.mid);
      g.vline(cx - 2, fy - 7, bot(0), body.lo);
      g.ellipse(cx, fy - 11, 5, 4.4, body.mid);
      g.ellipse(cx - 0.8, fy - 12.4, 3.2, 2.4, body.hi);
      g.set(cx, fy - 16, body.mid);
      g.set(cx + 1, fy - 17, body.mid);
      for (const ex of [cx - 3, cx + 2]) {
        g.rect(ex, fy - 13, 1, 2, 0x1f1d1a);
        g.set(ex, fy - 13, 0xffffff);
      }
      g.set(cx - 4, fy - 10, 0xf2a0a0);
      g.set(cx + 3, fy - 10, 0xf2a0a0);
      // 부리 (나를 향해 납작하게)
      g.hline(cx - 2, cx + 1, fy - 10, BEAK.hi);
      g.hline(cx - 2, cx + 1, fy - 9, BEAK.mid);
      g.hline(cx - 1, cx, fy - 8, BEAK.lo);
    } else {
      // 고물 꼬리 깃 (위로 살짝 들린)
      g.rect(cx - 2, bot(0) - 3, 4, 3, body.mid);
      g.hline(cx - 1, cx, bot(0) - 4, body.mid);
      g.hline(cx - 2, cx + 1, bot(0) - 3, body.hi);
      // 물레바퀴 (뒤에서 본 통: 흰 테 + 빨간 날개깃이 아래로 돈다)
      const wy = fy + 1;
      g.rect(cx - 5, wy, 11, 6, 0xf4f0e6);
      g.rect(cx - 4, wy + 1, 9, 4, 0x4a5a6a);
      for (let k = 0; k < 2; k++) g.hline(cx - 4, cx + 4, wy + 1 + ((k * 2 + frame) % 4), 0xe2604a);
    }
    // 가까운 차양 기둥 꼭대기 + 지붕
    for (const px of [cx - 16, cx + 16]) g.vline(px, ROOF_Y, ROOF_Y + 1, 0xd8d0c0);
    roof();
    g.outline(body.line);
    g.recolor((x, y) => y <= ROOF_Y + 1 && g.get(x, y) === Grid.rgba(body.line), darken(st.canopy, 0.55));
    if (down) g.recolor((x, y) => y >= fy - 11 && y <= fy - 7 && Math.abs(x - cx) <= 3 && g.get(x, y) === Grid.rgba(body.line), darken(BEAK.lo, 0.35));
  }
  return g;
}

/** 오리배 한 프레임 Grid (미리보기용). dir: 0 아래 · 1 왼쪽 · 2 오른쪽 · 3 위 (DIR) */
export function duckDirGrid(layer: "back" | "front", dir: number, frame: number, style: DuckStyle): Grid {
  if (dir === 0 || dir === 3) return duckVFrame(layer, dir === 0, frame, style);
  return duckGrid(layer, frame, style, dir === 1);
}

/** 앞·뒷모습 3프레임 시트. down = 머리가 화면 아래(앞모습) */
export function duckVSheet(layer: "back" | "front", down: boolean, style: DuckStyle): HTMLCanvasElement {
  const sheet = new Grid(DUCK_VW * DUCK_FRAMES, DUCK_VH);
  for (let f = 0; f < DUCK_FRAMES; f++) sheet.draw(duckVFrame(layer, down, f, style), f * DUCK_VW, 0);
  return sheet.toCanvas();
}

/** 오리배 그림 크기와 왼쪽 자리 발(원점) 픽셀 — 방향별 (dir: DIR) */
export function duckGeom(dir: number): { w: number; h: number; ax: number; ay: number } {
  if (dir === 0 || dir === 3) return { w: DUCK_VW, h: DUCK_VH, ax: DUCK_VSEAT_X, ay: DUCK_VFEET_Y };
  return { w: DUCK_W, h: DUCK_H, ax: dir === 1 ? DUCK_W - DUCK_SEAT_X - 12 - 1 : DUCK_SEAT_X, ay: DUCK_FEET_Y };
}

/** 오리배 선착장 팻말 "오리배 · 2인승" (글씨는 WorldMap 이름표가 아니라 BoatRide가 팻말 위에 얹는다). 26×30, 받침 = 아래 가운데 */
export const DUCK_SIGN_W = 26;
export const DUCK_SIGN_H = 30;
export function duckSign(): HTMLCanvasElement {
  const g = new Grid(DUCK_SIGN_W, DUCK_SIGN_H);
  // 기둥
  g.rect(12, 12, 3, 16, WOOD.mid);
  g.vline(12, 12, 27, WOOD.hi);
  // 판자 (둥근 모서리)
  g.rect(2, 3, 22, 11, WOOD.mid);
  g.hline(3, 22, 2, WOOD.mid);
  g.hline(2, 23, 3, WOOD.hi);
  g.hline(2, 23, 13, WOOD.lo);
  // 작은 오리 그림 (노랑 몸 + 주황 부리)
  g.ellipse(9.5, 9.5, 4, 2.4, 0xf7d046);
  g.ellipse(12, 6.5, 2, 2, 0xf7d046);
  g.set(14, 6, 0xf08a24);
  g.set(14, 7, 0xf08a24);
  g.set(12, 6, 0x1f1d1a);
  g.set(6, 8, 0xf7d046);
  // 물결 두 줄
  g.hline(16, 21, 7, 0x9fd0e6);
  g.hline(17, 22, 10, 0x9fd0e6);
  g.outline(WOOD.line);
  for (let x = 7; x <= 18; x++) g.set(x, DUCK_SIGN_H - 1, 0x000000, 60);
  return g.toCanvas();
}

// ── 텍스처 키 ──
const FACE_KEY = ["d", "l", "r", "u"] as const;
export const RIDE_TEX = {
  // 배 그림은 방향별 (dir: DIR 0 아래 · 1 왼쪽 · 2 오른쪽 · 3 위)
  boatBack: (seats: 1 | 2, dir: number, v: number) => `ride-boat${seats}-back-${FACE_KEY[dir] ?? "r"}-${v}`,
  boatFront: (seats: 1 | 2, dir: number, v: number) => `ride-boat${seats}-front-${FACE_KEY[dir] ?? "r"}-${v}`,
  duckBack: (dir: number, v: number) => `ride-duck-back-${FACE_KEY[dir] ?? "r"}-${v}`,
  duckFront: (dir: number, v: number) => `ride-duck-front-${FACE_KEY[dir] ?? "r"}-${v}`,
  duckSign: "ride-duck-sign",
  fountain: "ride-fountain",
  seesawBase: "ride-seesaw-base",
  seesawPlank: "ride-seesaw-plank",
  trampoline: "ride-trampoline",
  carouselFloor: "ride-carousel-floor",
  carouselTop: "ride-carousel-top",
  carouselPole: "ride-carousel-pole",
  horse: (v: number, left: boolean) => `ride-horse-${v}-${left ? "l" : "r"}`,
  horsePole: "ride-horse-pole",
} as const;
