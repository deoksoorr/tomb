import { darken, Grid, hash2, lighten, mix, type Color } from "../sprites/pixel";

// 11/26 캠핑장 집(zone "camp") 실내 픽셀아트 — game/housing/art.ts가 DRAW·SPIN_ART·UP·FLOOR·PAPER·창문에 끼워 넣어요.
//  - 기본 가구(fixture) 11종: 카라반(침대·식탁·간이 부엌·화장실 칸) · 펜션(TV·소파·주방·침대) · 촌캉스(자개장·이불장·밥상).
//    모두 네 방향 가구(spin): 앞(CAMP_DRAW)·왼쪽을 보는 옆모습(side)·뒷모습(back). 오른쪽은 옆모습을 좌우로 뒤집는다 (art.ts 규칙).
//    그림 크기 = (칸 w×16) × (칸 h×16 + 솟는 높이). 옆모습은 가로·세로 칸이 바뀐다. 테(outline)가 들어갈 자리로 왼쪽·오른쪽 끝 열과 맨 윗줄은 비운다.
//  - 침대 둘은 마을 침대와 같은 자리에 베개를 둔다 (interact.ts의 눕기 자리가 그대로 맞게). 색·무늬만 다르다.
//  - 전용 바닥·벽: floor_caravan·wall_caravan(밝은 자작나무 판) · floor_pension·wall_pension(원목 마루·통나무 벽) · floor_rural·wall_rural(노란 장판·한지 벽과 나무 기둥)
//  - 창문: 카라반 = 둥근 창, 펜션 = 넓은 통창, 촌캉스 = 한지 창살 창 (집 창문이 기본일 때만 — 주인이 고른 창문 모양이 있으면 그것)
// 순수 함수(Grid)라 Phaser 없이 시험해요.

type Draw = (g: Grid, W: number, H: number, v: string) => void;
type SpinArt = { side: Draw; back: Draw };
type Tile = (g: Grid, v: number) => void;

/** 캠핑장 기본 가구 테 (따뜻한 짙은 갈색) */
export const CAMP_EDGE = 0x2e1e14;
export const CAMP_EDGE_A = 175;

const has = (v: string, part: string) => v.split("-").includes(part);
/** 자개 반짝임 장면 (g0~g3) */
const glintOf = (v: string): number => {
  const t = v.split("-").find((x) => /^g[0-3]$/.test(x));
  return t ? Number(t[1]) : -1;
};

/** 칠한 상자 + 아랫변 그늘 */
const box = (g: Grid, x: number, y: number, w: number, h: number, c: Color, edge = darken(c, 0.3)) => {
  g.rect(x, y, w, h, c);
  g.hline(x, x + w - 1, y + h - 1, edge);
};
/** 발밑 그림자 한 줄 */
const foot = (g: Grid, x0: number, x1: number, y: number) => {
  for (let x = x0; x <= x1; x++) if (!g.filled(x, y)) g.set(x, y, 0x1a1006, 70);
};

// ── 팔레트 ──
/** 자작나무 (카라반) */
const BIRCH = { hi: 0xf2dcae, mid: 0xdec08a, lo: 0xb89262, line: 0x84603c } as const;
/** 호두나무 (펜션 가구) */
const WALNUT = { hi: 0x9a6a42, mid: 0x7a5032, lo: 0x5a3822, line: 0x3a2214 } as const;
/** 원목 (펜션 바닥·통나무) */
const OAK = { hi: 0xe6c08a, mid: 0xd4aa72, lo: 0xb88c58, line: 0x8a6440 } as const;
/** 감빛 나무 (촌캉스) */
const PINE = { hi: 0xb07a48, mid: 0x8e5c34, lo: 0x6a4226, line: 0x46281a } as const;
const FABRIC_BLUE = { hi: 0x7a9ac8, mid: 0x4e6e9e, lo: 0x3a547a } as const;
const SAGE = { hi: 0xb8ccae, mid: 0x93ad8a, lo: 0x6e8a68 } as const;
const STEEL = { hi: 0xe8ecf0, mid: 0xc4ccd4, lo: 0x98a2ac, dark: 0x5a6470 } as const;
const PEARL: readonly Color[] = [0xeaf6fa, 0xcfe8f2, 0xf2dcf0, 0xd8f2dc, 0xfaf0d6, 0xbfe0f4];

// ── 솟는 높이 (px) ──
export const CAMP_UP: Record<string, number> = {
  fx_cv_bed: 8,
  fx_cv_dinette: 8,
  fx_cv_kitchen: 12,
  fx_cv_toilet: 18,
  fx_pn_tv: 14,
  fx_pn_sofa: 6,
  fx_pn_kitchen: 14,
  fx_pn_bed: 8,
  fx_rr_jagae: 22,
  fx_rr_ibul: 18,
  fx_rr_bapsang: 2,
};

// ════════════════ 침대 (마을 침대와 같은 자리에 머리판·베개) ════════════════
// 11/26 누운 사람 덮개도 침대마다 따로 (paintCampBedCover): 침대 이불과 같은 무늬·색이 그림 좌표 그대로 이어지고,
// 덮개 깃(밝은 줄 + 시트 줄)이 침대 이불 깃과 같은 줄에 온다. 머리는 베개 가운데 (CAMP_BED_LIE_SHIFT)

/** 이불을 보는 방향: front = 머리가 위 · side = 머리가 오른쪽 · back = 머리가 아래 */
type QuiltView = "front" | "side" | "back";
/** 이불 무늬 한 점: (i, j) = 이불 칸 왼쪽 위에서 잰 자리. 칸 밖(음수 포함)으로 늘여도 같은 무늬라 누운 사람 덮개가 이어진다 */
type QuiltAt = (i: number, j: number, w: number, h: number, view: QuiltView) => Color;
type BedPal = { frame: { hi: Color; mid: Color; lo: Color }; sheet: Color; quilt: QuiltAt; pillows: 1 | 2 };

const md = (n: number, k: number) => ((n % k) + k) % k;

/** 빨간 체크 이불 (카라반) */
const redCheck: QuiltAt = (i, j) => {
  const gx = md(i + 1, 5) === 0;
  const gy = md(j + 2, 5) === 0;
  return gx && gy ? 0xfff0e6 : gx || gy ? 0xf09c8c : md(i + j, 7) === 0 ? 0xc03e38 : 0xd44a42;
};
/** 흰 누빔 이불 + 발치 쪽 남색 덧이불 띠 (펜션) — 띠는 늘 발치 (앞: 아래 · 옆: 왼쪽 · 뒤: 위), 흰 이불과 닿는 줄이 밝다 */
const whiteDuvet: QuiltAt = (i, j, w, h, view) => {
  if (view === "side") {
    const bw = Math.min(6, w);
    if (i < bw) return i === bw - 1 ? FABRIC_BLUE.hi : FABRIC_BLUE.mid;
  } else if (view === "front") {
    if (j >= h - 6) return j === h - 6 ? FABRIC_BLUE.hi : j === h - 3 && md(i, 5) === 2 ? FABRIC_BLUE.lo : FABRIC_BLUE.mid;
  } else if (j < 6) return j === 5 ? FABRIC_BLUE.hi : j === 2 && md(i, 5) === 2 ? FABRIC_BLUE.lo : FABRIC_BLUE.mid;
  return md(i + j * 2, 9) === 0 ? 0xdcd8ce : 0xf6f4ee;
};

/** 침대 방향(sd 0 앞 · 1 옆 · 2 뒤)마다 이불 칸과 깃 밝기 — 그리기와 누운 사람 덮개가 같이 쓴다 */
function quiltRect(sd: number, W: number, H: number): { x: number; y: number; w: number; h: number; view: QuiltView; hi: number } {
  if (sd % 2 === 1) return { x: 3, y: 9, w: W - 20, h: H - 12, view: "side", hi: 0.2 };
  if (sd === 2) return { x: 2, y: 7, w: W - 4, h: H - 28, view: "back", hi: 0.25 };
  return { x: 2, y: 20, w: W - 4, h: H - 22, view: "front", hi: 0.3 };
}
/** 매트리스 윗면 (머리판·발판·옆판을 뺀 칸 — 덮개는 이 안에만) */
function mattressRect(sd: number, W: number, H: number): { x0: number; x1: number; y0: number; y1: number } {
  if (sd % 2 === 1) return { x0: 3, x1: W - 6, y0: 9, y1: H - 4 };
  if (sd === 2) return { x0: 2, x1: W - 3, y0: 7, y1: H - 11 };
  return { x0: 2, x1: W - 3, y0: 10, y1: H - 4 };
}
const fillQuilt = (g: Grid, p: BedPal, sd: number, W: number, H: number) => {
  const q = quiltRect(sd, W, H);
  for (let j = 0; j < q.h; j++) for (let i = 0; i < q.w; i++) g.set(q.x + i, q.y + j, p.quilt(i, j, q.w, q.h, q.view));
};

function bedFront(g: Grid, W: number, H: number, p: BedPal): void {
  const F = p.frame;
  // 머리판 (위로 8px 솟음 — 맨 윗줄은 테 자리로 비운다)
  box(g, 1, 1, W - 2, 11, F.lo);
  g.rect(3, 3, W - 6, 6, F.mid);
  g.hline(3, W - 4, 3, F.hi);
  g.rect(1, 1, 3, 13, F.lo);
  g.rect(W - 4, 1, 3, 13, F.lo);
  // 매트리스 + 시트
  g.rect(2, 10, W - 4, H - 12, p.sheet);
  g.vline(2, 10, H - 3, darken(p.sheet, 0.14));
  g.vline(W - 3, 10, H - 3, darken(p.sheet, 0.14));
  // 베개
  if (p.pillows === 2) {
    g.rect(4, 11, 11, 6, 0xfbf8f0);
    g.rect(W - 15, 11, 11, 6, 0xfbf8f0);
    g.hline(4, 14, 16, 0xd8d0c0);
    g.hline(W - 15, W - 5, 16, 0xd8d0c0);
  } else {
    g.rect(7, 11, W - 14, 6, 0xfbf8f0);
    g.hline(7, W - 8, 16, 0xd8d0c0);
    g.hline(8, W - 9, 11, 0xffffff);
  }
  // 이불 + 접힌 깃
  fillQuilt(g, p, 0, W, H);
  g.hline(2, W - 3, 20, lighten(p.sheet, 0.3));
  g.hline(2, W - 3, 21, p.sheet);
  // 발판
  box(g, 1, H - 3, W - 2, 3, F.lo);
}

function bedSide(g: Grid, W: number, H: number, p: BedPal): void {
  const F = p.frame;
  // 머리가 오른쪽 (마을 침대 옆모습과 같은 자리)
  g.rect(1, 6, 3, H - 8, F.lo);
  g.rect(2, 7, 1, H - 10, F.mid);
  g.rect(3, 9, W - 7, H - 12, p.sheet);
  g.hline(3, W - 5, 9, lighten(p.sheet, 0.3));
  const ys = p.pillows === 2 ? [11, 23] : [13];
  for (const y of ys) {
    g.rect(W - 13, y, 8, p.pillows === 2 ? 10 : 18, 0xfbf8f0);
    g.vline(W - 13, y, y + (p.pillows === 2 ? 9 : 17), 0xd8d0c0);
  }
  // 깃은 앞모습처럼 베개에서 세 칸 떨어진 자리 (누운 사람 머리가 머리판에 묻히지 않게)
  fillQuilt(g, p, 1, W, H);
  g.vline(W - 17, 9, H - 4, lighten(p.sheet, 0.2));
  g.vline(W - 18, 9, H - 4, p.sheet);
  g.rect(W - 5, 1, 4, H - 2, F.lo);
  g.vline(W - 4, 3, H - 4, F.mid);
  g.hline(W - 5, W - 2, 1, F.hi);
  box(g, 1, H - 3, W - 2, 3, F.lo);
}

function bedBack(g: Grid, W: number, H: number, p: BedPal): void {
  const F = p.frame;
  // 머리가 아래 (발판이 위, 머리판이 베개 앞을 가린다). 깃은 앞모습과 같은 차례·간격 (베개에서 세 칸 띄고 밝은 줄 → 시트 줄 → 이불)
  box(g, 1, 2, W - 2, 5, F.lo);
  g.hline(1, W - 2, 2, F.mid);
  g.rect(2, 7, W - 4, H - 15, p.sheet);
  fillQuilt(g, p, 2, W, H);
  g.hline(2, W - 3, H - 21, p.sheet);
  g.hline(2, W - 3, H - 20, lighten(p.sheet, 0.25));
  if (p.pillows === 2) {
    g.rect(4, H - 16, 11, 6, 0xfbf8f0);
    g.rect(W - 15, H - 16, 11, 6, 0xfbf8f0);
  } else g.rect(7, H - 16, W - 14, 6, 0xfbf8f0);
  box(g, 1, H - 10, W - 2, 10, F.lo);
  g.rect(3, H - 8, W - 6, 5, F.mid);
  g.hline(3, W - 4, H - 8, F.hi);
  g.rect(1, H - 12, 3, 12, F.lo);
  g.rect(W - 4, H - 12, 3, 12, F.lo);
}

const CV_BED: BedPal = { frame: BIRCH, sheet: 0xf0e8d8, quilt: redCheck, pillows: 1 };
const PN_BED: BedPal = { frame: WALNUT, sheet: 0xf2efe6, quilt: whiteDuvet, pillows: 2 };

/** 캠핑장 침대 누운 사람 덮개 이름 (침대 · 방향 sd) — sprites/indoorPose LieCover */
export type CampBedCover = `${"cv" | "pn"}bed${0 | 1 | 2 | 3}`;
const COVER_BED = { cv: { id: "fx_cv_bed", pal: CV_BED }, pn: { id: "fx_pn_bed", pal: PN_BED } } as const;
export const isCampBedCover = (s: string): s is CampBedCover => /^(cv|pn)bed[0-3]$/.test(s);
/** 그 침대·방향의 덮개 (캠핑장 침대가 아니면 null) */
export function campBedCoverOf(id: string, sd: number): CampBedCover | null {
  const k = id === "fx_cv_bed" ? "cv" : id === "fx_pn_bed" ? "pn" : null;
  return k && sd >= 0 && sd <= 3 ? (`${k}bed${sd}` as CampBedCover) : null;
}

/**
 * 누운 자리 옮김 [dx, dy] px (마을 침대 눕기 자리 기준 — interact.ts houseSpots, sd 0 앞 · 1 왼쪽 · 2 뒤 · 3 오른쪽).
 * 덮개 깃이 침대 이불 깃과 같은 줄에 오고 머리가 베개 가운데 오게 맞췄다 (펜션 더블 침대는 베개 하나에)
 */
export const CAMP_BED_LIE_SHIFT: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  fx_cv_bed: [
    [0, 0],
    [0, -3],
    [0, 3],
    [0, -3],
  ],
  fx_pn_bed: [
    [-5, 0],
    [0, 3],
    [5, 3],
    [0, 3],
  ],
};

/** 자세 프레임 크기·발 원점 (sprites/avatarCore AV_W·AV_H, 원점 = 가운데·맨 아랫줄) */
const POSE_W = 20;
const POSE_H = 28;
const POSE_OX = POSE_W / 2;
const POSE_OY = POSE_H - 1;
/** 마을 침대 눕기 자리 (칸 위 왼쪽에서 잰 px — interact.ts houseSpots "bed") */
const LIE_BASE = { front: [16, 20], side: [8, 17], back: [16, 2] } as const;

/**
 * 자세 프레임 칸 (fx, fy) → 침대 그림 칸 (그림은 칸 위로 up px 솟는다. sd3은 뒤집기 전 옆모습 그림 좌표).
 * 자세 그림은 발 원점을 축으로 tilt(0 · 90 · 180 · −90도)만큼 돌아 그려진다 (HouseScene tiltLying)
 */
function frameToArt(sd: number, W: number, up: number, dx: number, dy: number, fx: number, fy: number): [number, number] {
  const ox = fx - POSE_OX;
  const oy = fy - POSE_OY;
  if (sd === 1) return [LIE_BASE.side[0] - oy - 1 + dx, up + LIE_BASE.side[1] + ox + dy];
  if (sd === 2) return [LIE_BASE.back[0] - ox - 1 + dx, up + LIE_BASE.back[1] - oy - 1 + dy];
  if (sd === 3) return [W - 1 - (W - LIE_BASE.side[0] + oy + dx), up + LIE_BASE.side[1] - ox - 1 + dy];
  return [LIE_BASE.front[0] + ox + dx, up + LIE_BASE.front[1] + oy + dy];
}

const coverArt = new Map<string, { bare: Grid; edged: Grid }>();
function bedArtOf(k: "cv" | "pn", sd: number): { bare: Grid; edged: Grid } {
  const key = `${k}${sd}`;
  let a = coverArt.get(key);
  if (!a) {
    const { id, pal } = COVER_BED[k];
    const W = 32;
    const H = 32 + CAMP_UP[id];
    const bare = new Grid(W, H);
    (sd === 2 ? bedBack : sd % 2 === 1 ? bedSide : bedFront)(bare, W, H, pal);
    const edged = new Grid(W, H);
    edged.px.set(bare.px);
    edged.outline(CAMP_EDGE, false, CAMP_EDGE_A);
    a = { bare, edged };
    coverArt.set(key, a);
  }
  return a;
}

/**
 * 캠핑장 침대에 누운 사람 덮개 (자세 프레임 g에, top = 덮개 윗줄). 침대 그림 안에 드는 칸만:
 * 윗줄 = 깃의 밝은 줄, 다음 줄 = 시트, 그 아래 = 침대 이불 무늬를 그림 좌표 그대로.
 * 머리판이 사람 앞에 오는 방향(옆·뒤)은 머리판 칸을 침대 그림 그대로 덮어 머리가 머리판 뒤로 들어간다
 */
export function paintCampBedCover(g: Grid, cover: CampBedCover, top: number): void {
  const k = cover.slice(0, 2) as "cv" | "pn";
  const sd = Number(cover[cover.length - 1]);
  const { id, pal } = COVER_BED[k];
  const W = 32;
  const H = 32 + CAMP_UP[id];
  const up = CAMP_UP[id];
  const [dx, dy] = CAMP_BED_LIE_SHIFT[id][sd];
  const { bare, edged } = bedArtOf(k, sd);
  const q = quiltRect(sd, W, H);
  const m = mattressRect(sd, W, H);
  const hi = lighten(pal.sheet, q.hi);
  for (let fy = 0; fy < g.h; fy++)
    for (let fx = 0; fx < g.w; fx++) {
      const [ax, ay] = frameToArt(sd, W, up, dx, dy, fx, fy);
      const board = sd === 2 ? ay >= H - 10 : sd % 2 === 1 && ax >= W - 5;
      if (board) {
        const v = edged.get(ax, ay);
        if (v & 255) g.px[fy * g.w + fx] = v;
        continue;
      }
      if (fy < top || ax < m.x0 || ax > m.x1 || ay < m.y0 || ay > m.y1 || !bare.filled(ax, ay)) continue;
      const r = fy - top;
      g.set(fx, fy, r === 0 ? hi : r === 1 ? pal.sheet : pal.quilt(ax - q.x, ay - q.y, q.w, q.h, q.view));
    }
}

// ════════════════ 카라반 식탁 (2×2 — 위 벤치 · 식탁 · 아래 벤치) ════════════════

/** 파란 방석 벤치 (위에서 본 앉는 판 + 등받이) */
function bench(g: Grid, x: number, y: number, w: number, seatH: number, backH: number, backTop: boolean): void {
  if (backTop) {
    box(g, x, y, w, backH, BIRCH.lo, BIRCH.line);
    g.rect(x + 2, y + 1, w - 4, backH - 3, FABRIC_BLUE.mid);
    g.hline(x + 2, x + w - 3, y + 1, FABRIC_BLUE.hi);
    box(g, x, y + backH, w, seatH, BIRCH.mid, BIRCH.line);
    g.rect(x + 2, y + backH, w - 4, seatH - 2, FABRIC_BLUE.hi);
    g.hline(x + 2, x + w - 3, y + backH + seatH - 3, FABRIC_BLUE.mid);
  } else {
    box(g, x, y, w, seatH, BIRCH.mid, BIRCH.line);
    g.rect(x + 2, y, w - 4, seatH - 2, FABRIC_BLUE.hi);
    g.hline(x + 2, x + w - 3, y + seatH - 3, FABRIC_BLUE.mid);
    // 앞쪽 등받이 뒷면 (나무 판)
    box(g, x, y + seatH, w, backH, BIRCH.mid, BIRCH.line);
    g.hline(x, x + w - 1, y + seatH, BIRCH.hi);
    for (let i = x + 3; i < x + w - 2; i += 6) g.vline(i, y + seatH + 1, y + seatH + backH - 2, BIRCH.lo);
  }
}
/** 식탁 위 머그 */
const mug = (g: Grid, x: number, y: number, c: Color) => {
  g.rect(x, y, 3, 3, c);
  g.set(x + 3, y + 1, c);
  g.hline(x, x + 2, y, lighten(c, 0.35));
};

function dinetteFront(g: Grid, W: number, H: number, back: boolean): void {
  bench(g, 2, 1, W - 4, 6, 10, true);
  // 식탁 (판 + 앞 모서리 + 다리 하나)
  g.rect(4, 18, W - 8, 8, BIRCH.hi);
  g.hline(4, W - 5, 18, 0xfff2d0);
  box(g, 4, 25, W - 8, 3, BIRCH.mid, BIRCH.line);
  g.rect(W / 2 - 1, 28, 2, 2, BIRCH.line);
  // 식탁 위: 머그 둘 + 작은 꽃병 (뒷모습은 자리가 바뀐다)
  mug(g, back ? W - 11 : 8, 20, 0xe8e4dc);
  mug(g, back ? 8 : W - 11, 21, 0xd86a5a);
  g.rect(W / 2 - 1, 19, 2, 3, 0x8ac0d8);
  g.set(W / 2 - 1, 18, 0xf0c040);
  g.set(W / 2, 17, 0xe86a7a);
  bench(g, 2, 30, W - 4, 5, 4, false);
  foot(g, 2, W - 3, H - 1);
}

function dinetteSide(g: Grid, W: number, H: number): void {
  // 왼쪽을 봄: 벤치가 왼쪽·오른쪽 열, 식탁은 가운데 세로
  const seat = (x: number, backRight: boolean) => {
    box(g, x, 6, 9, H - 9, BIRCH.mid, BIRCH.line);
    g.rect(x + 1, 8, 7, H - 14, FABRIC_BLUE.hi);
    const bx = backRight ? x + 6 : x;
    g.rect(bx, 2, 3, H - 5, BIRCH.lo);
    g.vline(bx + 1, 3, H - 5, FABRIC_BLUE.mid);
  };
  seat(1, false);
  seat(W - 10, true);
  g.rect(11, 9, 10, H - 16, BIRCH.hi);
  g.vline(11, 9, H - 8, 0xfff2d0);
  box(g, 11, H - 8, 10, 3, BIRCH.mid, BIRCH.line);
  mug(g, 14, 14, 0xe8e4dc);
  mug(g, 14, 24, 0xd86a5a);
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 카라반 간이 부엌 (2×1) ════════════════

function cvKitchenFront(g: Grid, W: number, H: number, v: string): void {
  const top = H - 16;
  // 뒤판 (자작 판 + 작은 선반 + 국자)
  g.rect(2, 1, W - 4, top - 1, BIRCH.mid);
  for (let x = 5; x < W - 3; x += 5) g.vline(x, 1, top - 2, BIRCH.lo);
  g.hline(2, W - 3, 1, BIRCH.hi);
  g.rect(3, 4, 12, 2, BIRCH.line);
  g.rect(4, 2, 2, 2, 0xd8604a);
  g.rect(7, 1, 2, 3, 0xe8c860);
  g.rect(10, 2, 3, 2, 0x7ab86a);
  g.vline(W - 7, 4, top - 4, STEEL.dark);
  g.rect(W - 8, top - 4, 3, 2, STEEL.mid);
  // 상판 + 개수대 + 수도꼭지 + 버너 둘
  g.rect(1, top, W - 2, 3, 0xe6e2da);
  g.hline(1, W - 2, top, 0xfaf8f2);
  g.rect(3, top, 11, 2, STEEL.lo);
  g.hline(4, 12, top, STEEL.dark);
  g.vline(8, top - 4, top - 1, STEEL.mid);
  g.hline(8, 10, top - 4, STEEL.mid);
  const cook = has(v, "cook");
  for (const bx of [18, 25]) {
    g.rect(bx, top, 5, 2, 0x3a3634);
    if (cook) g.hline(bx + 1, bx + 3, top + 1, 0xff7a3a);
  }
  // 버너 위 냄비
  g.rect(18, top - 5, 6, 5, 0x5a6470);
  g.hline(18, 23, top - 5, 0x8a96a2);
  g.set(17, top - 4, 0x5a6470);
  g.set(24, top - 4, 0x5a6470);
  if (cook) for (const [x, y] of [[20, top - 8], [21, top - 10], [19, top - 12], [22, top - 7], [20, top - 13]]) g.set(x, y, 0xf6f6f2, 210);
  // 아래 수납장 (문 둘 + 손잡이)
  box(g, 1, top + 3, W - 2, H - top - 4, BIRCH.mid, BIRCH.line);
  g.vline(W / 2, top + 4, H - 3, BIRCH.line);
  g.rect(3, top + 5, W / 2 - 5, H - top - 9, BIRCH.hi);
  g.rect(W / 2 + 2, top + 5, W / 2 - 5, H - top - 9, BIRCH.hi);
  g.rect(W / 2 - 3, top + 8, 2, 2, STEEL.dark);
  g.rect(W / 2 + 2, top + 8, 2, 2, STEEL.dark);
  foot(g, 1, W - 2, H - 1);
}

function cvKitchenSide(g: Grid, W: number, H: number, v: string): void {
  // 왼쪽을 봄 (세로로 긴 조리대를 옆에서): 상판이 길게, 오른쪽에 뒤판, 왼쪽에 수납장 문
  g.rect(W - 4, 1, 3, H - 5, BIRCH.lo);
  g.vline(W - 3, 2, H - 6, BIRCH.mid);
  g.rect(2, 12, W - 6, H - 18, 0xe6e2da);
  g.vline(2, 12, H - 7, 0xfaf8f2);
  g.rect(4, 14, 6, 9, STEEL.lo);
  g.vline(5, 15, 21, STEEL.dark);
  g.rect(4, 28, 6, 4, 0x3a3634);
  g.rect(4, 34, 6, 4, 0x3a3634);
  g.rect(4, 26, 6, 5, 0x5a6470);
  if (has(v, "cook")) {
    g.hline(5, 8, 33, 0xff7a3a);
    for (const [x, y] of [[6, 22], [7, 20], [5, 18]]) g.set(x, y, 0xf6f6f2, 210);
  }
  box(g, 1, H - 7, W - 4, 6, BIRCH.mid, BIRCH.line);
  g.rect(2, H - 6, 2, 3, BIRCH.hi);
  foot(g, 1, W - 2, H - 1);
}

function cvKitchenBack(g: Grid, W: number, H: number): void {
  const top = H - 16;
  // 뒤: 냄비 머리만 보이고 수납장 뒤판
  g.rect(18, top - 4, 6, 3, 0x5a6470);
  g.hline(18, 23, top - 4, 0x8a96a2);
  g.rect(1, top - 1, W - 2, 3, 0xe6e2da);
  box(g, 1, top + 2, W - 2, H - top - 3, BIRCH.lo, BIRCH.line);
  for (let x = 4; x < W - 2; x += 7) g.vline(x, top + 3, H - 3, BIRCH.mid);
  g.hline(1, W - 2, top + 2, BIRCH.mid);
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 카라반 화장실 칸 (2×2) ════════════════

function toiletBooth(g: Grid, W: number, H: number, view: "front" | "side" | "back", open: boolean): void {
  const y0 = 2;
  // 벽 (흰 판 + 위 테)
  g.rect(2, y0, W - 4, H - y0 - 2, 0xeef2f2);
  for (let y = y0 + 4; y < H - 3; y += 6) g.hline(3, W - 4, y, 0xdde4e6);
  box(g, 1, y0 - 1, W - 2, 4, STEEL.mid, STEEL.lo);
  g.hline(1, W - 2, y0 - 1, STEEL.hi);
  g.vline(2, y0 + 3, H - 3, 0xd4dadc);
  g.vline(W - 3, y0 + 3, H - 3, 0xc4ccd0);
  g.hline(2, W - 3, H - 3, 0xb8c0c4);
  if (view === "front") {
    const dx = 8;
    const dw = W - 16;
    const dy = y0 + 6;
    if (open) {
      // 안쪽: 타일 바닥 + 변기 + 물통 + 휴지
      for (let y = dy; y < H - 3; y++) for (let x = dx; x < dx + dw; x++) g.set(x, y, ((x >> 2) + (y >> 2)) % 2 ? 0xc8d8e4 : 0xe4eef4);
      g.rect(dx + 4, dy + 16, 8, 6, 0xffffff);
      g.hline(dx + 4, dx + 11, dy + 16, 0xdfe6ea);
      g.ellipse(dx + 8, dy + 27, 5, 4, 0xffffff);
      g.ellipse(dx + 8, dy + 27, 3, 2, 0xb8d4e4);
      g.rect(dx + dw - 4, dy + 12, 3, 4, 0xf6f6f0);
      // 열린 문짝 (오른쪽 벽에 붙음)
      g.rect(dx + dw, dy, 4, H - dy - 3, 0xa8c4d4);
      g.vline(dx + dw, dy, H - 4, 0x7a98ac);
    } else {
      g.rect(dx, dy, dw, H - dy - 3, 0xb4cad8);
      g.rect(dx + 1, dy + 1, dw - 2, H - dy - 5, 0xc4d8e4);
      g.ellipse(dx + dw / 2, dy + 7, 3.5, 3.5, STEEL.lo);
      g.ellipse(dx + dw / 2, dy + 7, 2.4, 2.4, 0x9cc4d8);
      g.set(dx + dw / 2 - 1, dy + 6, 0xe8f4fa);
      g.rect(dx + dw - 4, dy + 22, 2, 4, STEEL.dark);
      // 문패 (WC)
      g.rect(dx + dw / 2 - 3, dy + 13, 6, 3, 0x6a8aa0);
      g.hline(dx + dw / 2 - 2, dx + dw / 2 + 1, dy + 14, 0xf0f4f6);
    }
  } else if (view === "side") {
    // 옆벽: 작은 환기창 + 물 배관
    g.rect(W / 2 - 4, y0 + 8, 8, 5, STEEL.lo);
    for (let y = y0 + 9; y < y0 + 12; y++) g.hline(W / 2 - 3, W / 2 + 2, y, y % 2 ? 0x6a7682 : STEEL.mid);
    g.vline(6, y0 + 16, H - 4, STEEL.lo);
    g.hline(6, 10, y0 + 16, STEEL.lo);
  } else {
    // 뒷벽: 환풍기 + 판 이음
    g.ellipse(W / 2, y0 + 10, 4, 4, STEEL.lo);
    g.ellipse(W / 2, y0 + 10, 2.5, 2.5, 0x6a7682);
    g.vline(W / 2, y0 + 15, H - 4, 0xd4dadc);
  }
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 펜션 TV (2×1) ════════════════

function tvScreen(g: Grid, x: number, y: number, w: number, h: number, on: boolean): void {
  g.rect(x, y, w, h, 0x1a1c22);
  if (!on) {
    g.rect(x + 1, y + 1, w - 2, h - 2, 0x2c3240);
    for (let i = 0; i < 5; i++) g.set(x + 3 + i, y + h - 3 - i, 0x46506a);
    return;
  }
  // 켜진 화면: 하늘·산·강 풍경 + 작은 사람
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) g.set(x + i, y + j, mix(0x7ac0ec, 0xc8ecfa, j / h));
  for (let i = 1; i < w - 1; i++) {
    const m = Math.round(h * 0.55 + Math.sin(i / 3) * 2);
    for (let j = m; j < h - 1; j++) g.set(x + i, y + j, j > h - 4 ? 0x4a8ac0 : 0x5aa060);
  }
  g.rect(x + w - 7, y + 3, 3, 3, 0xfff0a0);
  g.set(x + 6, y + h - 5, 0xe8604a);
  g.set(x + 6, y + h - 6, 0xf6d8b8);
}

function tvFront(g: Grid, W: number, H: number, v: string): void {
  const sw = W - 6;
  tvScreen(g, 3, 1, sw, 15, has(v, "on"));
  g.rect(W / 2 - 2, 16, 4, 2, 0x2a2c32);
  // 낮은 장 (호두나무, 서랍 둘)
  box(g, 1, H - 12, W - 2, 11, WALNUT.mid, WALNUT.line);
  g.hline(1, W - 2, H - 12, WALNUT.hi);
  g.vline(W / 2, H - 11, H - 3, WALNUT.line);
  g.hline(5, W / 2 - 4, H - 7, WALNUT.hi);
  g.hline(W / 2 + 4, W - 6, H - 7, WALNUT.hi);
  g.rect(4, H - 13, 3, 1, 0x7ab86a);
  g.rect(W - 8, H - 15, 4, 3, 0xe8d8a8);
  foot(g, 1, W - 2, H - 1);
}

function tvSide(g: Grid, W: number, H: number, v: string): void {
  // 왼쪽을 봄: 장이 세로로 길고, TV는 옆에서 본 얇은 판
  box(g, 2, 14, W - 4, H - 15, WALNUT.mid, WALNUT.line);
  g.vline(2, 14, H - 3, WALNUT.hi);
  g.hline(3, W - 4, Math.floor((14 + H) / 2), WALNUT.line);
  g.rect(W / 2 - 1, 2, 3, 26, 0x1a1c22);
  g.vline(W / 2 - 1, 3, 26, has(v, "on") ? 0x7ac0ec : 0x2c3240);
  g.rect(W / 2 - 2, 27, 5, 2, 0x2a2c32);
  foot(g, 1, W - 2, H - 1);
}

function tvBack(g: Grid, W: number, H: number, v: string): void {
  g.rect(4, 2, W - 8, 13, 0x2a2c32);
  for (let y = 4; y < 13; y += 2) g.hline(8, W - 9, y, 0x3a3e46);
  g.rect(W / 2 - 3, 7, 6, 4, 0x1e2026);
  if (has(v, "on")) g.set(W - 6, 13, 0x7ae08a);
  box(g, 1, H - 13, W - 2, 12, WALNUT.lo, WALNUT.line);
  g.hline(1, W - 2, H - 13, WALNUT.mid);
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 펜션 소파 (2×1, 두 자리 — 마을 소파와 같은 자리) ════════════════

function sofaFront(g: Grid, W: number, H: number): void {
  box(g, 2, 1, W - 4, 10, SAGE.mid, SAGE.lo);
  g.hline(3, W - 4, 1, SAGE.hi);
  // 팔걸이
  box(g, 1, 5, 4, H - 7, SAGE.lo, darken(SAGE.lo, 0.3));
  box(g, W - 5, 5, 4, H - 7, SAGE.lo, darken(SAGE.lo, 0.3));
  g.hline(1, 4, 5, SAGE.mid);
  g.hline(W - 5, W - 2, 5, SAGE.mid);
  // 방석 둘
  g.rect(5, 10, W / 2 - 5, 7, SAGE.hi);
  g.rect(W / 2 + 1, 10, W / 2 - 6, 7, SAGE.hi);
  g.vline(W / 2, 10, 16, SAGE.lo);
  g.hline(5, W - 6, 16, SAGE.mid);
  // 쿠션 하나 (겨자색)
  g.rect(6, 5, 6, 5, 0xe0b048);
  g.hline(6, 11, 5, 0xf0cc70);
  box(g, 2, H - 5, W - 4, 3, darken(SAGE.lo, 0.15), darken(SAGE.lo, 0.4));
  g.set(3, H - 2, WALNUT.line);
  g.set(W - 4, H - 2, WALNUT.line);
  foot(g, 2, W - 3, H - 1);
}

function sofaSide(g: Grid, W: number, H: number): void {
  // 왼쪽을 봄: 등받이 오른쪽, 앉는 판 둘 왼쪽 (위·아래 팔걸이)
  box(g, W - 6, 1, 5, H - 3, SAGE.mid, SAGE.lo);
  g.vline(W - 6, 2, H - 4, SAGE.hi);
  box(g, 2, 2, W - 7, 4, SAGE.lo);
  box(g, 2, H - 7, W - 7, 5, SAGE.lo);
  g.rect(2, 6, W - 8, 12, SAGE.hi);
  g.rect(2, 19, W - 8, H - 26, SAGE.hi);
  g.hline(2, W - 7, 18, SAGE.lo);
  g.rect(W - 11, 8, 4, 6, 0xe0b048);
  foot(g, 1, W - 2, H - 1);
}

function sofaBack(g: Grid, W: number, H: number): void {
  g.rect(5, 1, W / 2 - 5, 4, SAGE.hi);
  g.rect(W / 2 + 1, 1, W / 2 - 6, 4, SAGE.hi);
  box(g, 1, 3, 4, H - 5, SAGE.lo);
  box(g, W - 5, 3, 4, H - 5, SAGE.lo);
  box(g, 2, 5, W - 4, H - 8, SAGE.mid, SAGE.lo);
  g.hline(2, W - 3, 5, SAGE.hi);
  g.vline(W / 2, 7, H - 5, SAGE.lo);
  g.set(3, H - 2, WALNUT.line);
  g.set(W - 4, H - 2, WALNUT.line);
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 펜션 주방 (3×1) ════════════════

function pnKitchenFront(g: Grid, W: number, H: number, v: string): void {
  const top = H - 15;
  // 위 수납장 (흰 문 + 나무 손잡이) · 가운데 후드
  g.rect(2, 1, W - 4, 7, 0xf4f2ec);
  g.hline(2, W - 3, 7, 0xd6d2c8);
  for (let x = 2 + 11; x < W - 12; x += 11) g.vline(x, 1, 6, 0xd6d2c8);
  g.rect(W - 15, 1, 12, 6, STEEL.mid);
  g.hline(W - 15, W - 4, 6, STEEL.lo);
  for (let x = 6; x < W - 17; x += 11) g.rect(x, 5, 3, 1, OAK.lo);
  // 타일 벽
  g.rect(2, 8, W - 4, top - 8, 0xf2f0ea);
  for (let y = 10; y < top; y += 3) g.hline(2, W - 3, y, 0xdcd8d0);
  for (let x = 4; x < W - 2; x += 4) g.vline(x, 8, top - 1, 0xe2ded6);
  // 원목 상판
  g.rect(1, top, W - 2, 3, OAK.mid);
  g.hline(1, W - 2, top, OAK.hi);
  // 개수대 (왼쪽) · 도마와 채소 (가운데) · 레인지 + 냄비 (오른쪽)
  g.rect(4, top, 10, 2, STEEL.lo);
  g.vline(9, top - 5, top - 1, STEEL.mid);
  g.hline(9, 11, top - 5, STEEL.mid);
  g.rect(19, top - 1, 9, 2, 0xe8d0a0);
  g.rect(20, top - 2, 3, 1, 0x6ab85a);
  g.rect(24, top - 2, 2, 1, 0xe86a4a);
  const cook = has(v, "cook");
  g.rect(W - 14, top, 10, 2, 0x2a2a2e);
  if (cook) g.hline(W - 13, W - 6, top + 1, 0xff7a3a);
  g.rect(W - 12, top - 5, 7, 5, 0xd84a3a);
  g.hline(W - 12, W - 6, top - 5, 0xf07a6a);
  if (cook) for (const [x, y] of [[W - 9, top - 8], [W - 8, top - 10], [W - 10, top - 12], [W - 7, top - 7]]) g.set(x, y, 0xffffff, 210);
  // 아래 수납장 · 오븐 문
  box(g, 1, top + 3, W - 2, H - top - 4, 0xf0eee6, 0xbab6ac);
  for (let x = 1 + 11; x < W - 15; x += 11) g.vline(x, top + 4, H - 3, 0xd0ccc2);
  g.rect(W - 14, top + 5, 10, H - top - 9, 0x3a3a40);
  g.rect(W - 12, top + 7, 6, 3, 0x5a5048);
  g.hline(W - 13, W - 6, top + 4, STEEL.mid);
  for (let x = 8; x < W - 17; x += 11) g.rect(x, top + 6, 3, 1, OAK.lo);
  foot(g, 1, W - 2, H - 1);
}

function pnKitchenSide(g: Grid, W: number, H: number, v: string): void {
  g.rect(W - 5, 1, 4, H - 4, 0xf2f0ea);
  g.vline(W - 5, 2, H - 5, 0xdcd8d0);
  g.rect(2, 12, W - 7, H - 18, OAK.mid);
  g.vline(2, 12, H - 7, OAK.hi);
  g.rect(4, 15, 6, 9, STEEL.lo);
  g.rect(4, 29, 6, 7, 0xe8d0a0);
  g.rect(3, H - 20, 8, 9, 0x2a2a2e);
  g.rect(4, H - 18, 6, 5, 0xd84a3a);
  if (has(v, "cook")) for (const [x, y] of [[6, H - 22], [7, H - 24], [5, H - 26]]) g.set(x, y, 0xffffff, 210);
  box(g, 1, H - 7, W - 5, 6, 0xf0eee6, 0xbab6ac);
  foot(g, 1, W - 2, H - 1);
}

function pnKitchenBack(g: Grid, W: number, H: number): void {
  const top = H - 15;
  g.rect(W - 12, top - 4, 7, 3, 0xd84a3a);
  g.rect(1, top - 1, W - 2, 3, OAK.mid);
  g.hline(1, W - 2, top - 1, OAK.hi);
  box(g, 1, top + 2, W - 2, H - top - 3, 0xe4e0d6, 0xaaa69c);
  for (let x = 6; x < W - 2; x += 8) g.vline(x, top + 3, H - 3, 0xd0ccc2);
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 촌캉스 자개장 (2×1) ════════════════

const LACQ = { hi: 0x3e3446, mid: 0x262030, lo: 0x18141e } as const;
const BRASS = { hi: 0xf6dc80, mid: 0xd8b048, lo: 0x9a7a2a } as const;

/** 자개 한 점 (빛 받는 쪽은 하양에 가깝게, 장면 g마다 반짝이는 줄이 옮겨 간다) */
function pearl(g: Grid, x: number, y: number, glint: number): void {
  const k = Math.floor(hash2(x, y, 71) * PEARL.length);
  let c = PEARL[k];
  if (glint >= 0 && Math.abs(((x + y) % 16) - glint * 4) <= 1) c = 0xffffff;
  g.set(x, y, c);
}

/** 학 한 마리 (자개) — 오른쪽을 본다 */
function crane(g: Grid, x: number, y: number, glint: number): void {
  const pts: [number, number][] = [
    [3, 0], [4, 1], [4, 2], [3, 3], [2, 4], [3, 4], [4, 4], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [0, 6], [1, 6], [5, 6], [6, 6], [7, 6], [3, 7], [3, 8], [4, 8], [2, 9], [4, 9],
  ];
  for (const [dx, dy] of pts) pearl(g, x + dx, y + dy, glint);
  g.set(x + 4, y, 0xe84a3a); // 붉은 정수리
}
/** 매화 가지 (자개 꽃 + 가는 가지) */
function blossoms(g: Grid, x: number, y: number, w: number, glint: number): void {
  for (let i = 0; i < w; i++) {
    const yy = y + Math.round(Math.sin(i / 2.2) * 1.5) + Math.floor(i / 3);
    g.set(x + i, yy, 0x8a7a6a);
    if (i % 3 === 1) {
      pearl(g, x + i, yy - 1, glint);
      pearl(g, x + i - 1, yy - 2, glint);
      pearl(g, x + i + 1, yy - 2, glint);
      g.set(x + i, yy - 2, 0xf0a0b8);
    }
  }
}

function jagaeFront(g: Grid, W: number, H: number, v: string): void {
  const glint = glintOf(v);
  const top = 2;
  const bot = H - 5;
  // 몸통 (옻칠) + 위 갓 + 테
  g.rect(2, top + 2, W - 4, bot - top - 2, LACQ.mid);
  g.rect(1, top, W - 2, 3, LACQ.hi);
  g.hline(1, W - 2, top, 0x5a4c64);
  g.rect(2, bot - 3, W - 4, 3, LACQ.lo);
  g.vline(2, top + 3, bot - 1, LACQ.hi);
  if (has(v, "open")) {
    // 문 열림: 개어 둔 한복·이불이 층층이
    g.rect(4, top + 4, W - 8, bot - top - 8, 0x3a2a20);
    const colors = [0xe86a8a, 0x7ac0a8, 0xf0c860, 0xa0b8e8, 0xe89a6a];
    for (let i = 0; i < 5; i++) {
      const y = top + 5 + i * 4;
      if (y + 3 > bot - 4) break;
      g.rect(5, y, W - 10, 3, colors[i]);
      g.hline(5, W - 6, y, lighten(colors[i], 0.35));
    }
    g.rect(1, top + 3, 3, bot - top - 4, LACQ.lo);
    g.rect(W - 4, top + 3, 3, bot - top - 4, LACQ.lo);
  } else {
    // 문 둘 (가운데 줄 + 놋쇠 경첩·고리) · 왼문 학, 오른문 매화
    g.vline(W / 2, top + 3, bot - 4, LACQ.lo);
    frameRect(g, 4, top + 5, W / 2 - 6, bot - top - 11, 0x4a3c58);
    frameRect(g, W / 2 + 2, top + 5, W / 2 - 6, bot - top - 11, 0x4a3c58);
    crane(g, 5, top + 8, glint);
    blossoms(g, W / 2 + 3, top + 9, W / 2 - 7, glint);
    // 구름 무늬 띠 (자개 점선)
    for (let x = 4; x < W - 4; x += 2) pearl(g, x, top + 4, glint);
    for (let x = 5; x < W - 4; x += 3) pearl(g, x, bot - 5, glint);
    g.rect(W / 2 - 3, top + 14, 2, 3, BRASS.mid);
    g.rect(W / 2 + 1, top + 14, 2, 3, BRASS.mid);
    g.set(W / 2 - 3, top + 14, BRASS.hi);
    g.set(W / 2 + 1, top + 14, BRASS.hi);
    for (const y of [top + 6, bot - 8]) {
      g.rect(3, y, 2, 2, BRASS.lo);
      g.rect(W - 5, y, 2, 2, BRASS.lo);
    }
  }
  // 다리 (짧은 발)
  g.rect(3, bot, 3, H - bot - 1, LACQ.lo);
  g.rect(W - 6, bot, 3, H - bot - 1, LACQ.lo);
  g.hline(3, 5, bot, BRASS.lo);
  g.hline(W - 6, W - 4, bot, BRASS.lo);
  foot(g, 2, W - 3, H - 1);
}

function frameRect(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}

function jagaeSide(g: Grid, W: number, H: number, v: string): void {
  const glint = glintOf(v);
  const bot = H - 5;
  g.rect(2, 4, W - 4, bot - 4, LACQ.mid);
  g.rect(1, 2, W - 2, 3, LACQ.hi);
  g.vline(2, 5, bot - 1, LACQ.lo);
  g.vline(W - 3, 5, bot - 1, LACQ.hi);
  // 옆면 자개 둥근 무늬 하나
  for (let a = 0; a < 16; a++) pearl(g, Math.round(W / 2 + Math.cos(a / 2.55) * 3), Math.round(16 + Math.sin(a / 2.55) * 3), glint);
  blossoms(g, 4, 30, W - 8, glint);
  g.rect(W - 6, 10, 2, 3, BRASS.mid);
  g.rect(3, bot, 3, H - bot - 1, LACQ.lo);
  g.rect(W - 6, bot, 3, H - bot - 1, LACQ.lo);
  foot(g, 2, W - 3, H - 1);
}

function jagaeBack(g: Grid, W: number, H: number): void {
  const bot = H - 5;
  g.rect(2, 4, W - 4, bot - 4, 0x3a2c22);
  for (let x = 6; x < W - 3; x += 6) g.vline(x, 5, bot - 1, 0x2a1e16);
  g.rect(1, 2, W - 2, 3, LACQ.hi);
  g.rect(3, bot, 3, H - bot - 1, LACQ.lo);
  g.rect(W - 6, bot, 3, H - bot - 1, LACQ.lo);
  foot(g, 2, W - 3, H - 1);
}

// ════════════════ 촌캉스 이불장 (2×1) ════════════════

const QUILTS: readonly { c: Color; hi: Color }[] = [
  { c: 0xe8789a, hi: 0xf8b0c6 },
  { c: 0x6cb8a0, hi: 0xa8e0cc },
  { c: 0xf0c050, hi: 0xffe08a },
  { c: 0x8a9ae0, hi: 0xbcc6f6 },
  { c: 0xe8906a, hi: 0xf8c0a0 },
];

/** 개어 쌓은 솜이불 한 채 (공단 윤기 줄) */
function quilt(g: Grid, x: number, y: number, w: number, h: number, q: (typeof QUILTS)[number]): void {
  g.rect(x, y, w, h, q.c);
  g.hline(x + 1, x + w - 2, y, q.hi);
  for (let i = x + 2; i < x + w - 1; i += 4) g.set(i, y + Math.floor(h / 2), darken(q.c, 0.15));
  g.set(x, y + h - 1, darken(q.c, 0.25));
  g.set(x + w - 1, y + h - 1, darken(q.c, 0.25));
}

function ibulFront(g: Grid, W: number, H: number, v: string): void {
  const top = 2;
  const bot = H - 4;
  g.rect(1, top, W - 2, 3, PINE.hi);
  g.hline(1, W - 2, top, lighten(PINE.hi, 0.2));
  g.rect(2, top + 3, W - 4, bot - top - 3, PINE.mid);
  g.rect(4, top + 4, W - 8, bot - top - 9, 0x4a2e1c);
  // 이불 다섯 채
  const out = has(v, "open");
  for (let i = 0; i < 5; i++) {
    const y = top + 5 + i * 4;
    if (out && i === 1) continue;
    quilt(g, 5, y, W - 10, 3, QUILTS[i]);
  }
  if (out) {
    // 꺼낸 이불 한 채가 장 앞에 늘어진다
    g.rect(6, top + 9, W - 12, bot - top - 6, QUILTS[1].c);
    g.hline(6, W - 7, top + 9, QUILTS[1].hi);
    for (let y = top + 12; y < bot - 1; y += 3) g.hline(7, W - 8, y, darken(QUILTS[1].c, 0.1));
  } else {
    // 반쯤 밀어 둔 미닫이 문 (창살 + 한지)
    g.rect(W / 2 + 1, top + 4, W / 2 - 5, bot - top - 9, 0xf2e8cc);
    for (let x = W / 2 + 3; x < W - 4; x += 3) g.vline(x, top + 4, bot - 6, PINE.lo);
    for (let y = top + 8; y < bot - 6; y += 5) g.hline(W / 2 + 1, W - 5, y, PINE.lo);
    g.vline(W / 2 + 1, top + 4, bot - 6, PINE.line);
  }
  // 아래 서랍 + 놋쇠 고리
  box(g, 2, bot - 5, W - 4, 5, PINE.lo, PINE.line);
  g.rect(W / 2 - 2, bot - 3, 4, 1, BRASS.mid);
  g.rect(3, bot, 2, H - bot - 1, PINE.line);
  g.rect(W - 5, bot, 2, H - bot - 1, PINE.line);
  foot(g, 2, W - 3, H - 1);
}

function ibulSide(g: Grid, W: number, H: number, v: string): void {
  const bot = H - 4;
  g.rect(1, 2, W - 2, 3, PINE.hi);
  g.rect(2, 5, W - 4, bot - 5, PINE.mid);
  g.vline(2, 5, bot - 1, PINE.hi);
  // 옆에서 본 쌓인 이불 끝단 (문 쪽 왼편)
  for (let i = 0; i < 6; i++) {
    const q = QUILTS[i % QUILTS.length];
    if (has(v, "open") && i === 1) continue;
    g.rect(3, 8 + i * 4, 4, 3, q.c);
    g.set(3, 8 + i * 4, q.hi);
  }
  box(g, 2, bot - 5, W - 4, 5, PINE.lo, PINE.line);
  g.rect(3, bot, 2, H - bot - 1, PINE.line);
  g.rect(W - 5, bot, 2, H - bot - 1, PINE.line);
  foot(g, 2, W - 3, H - 1);
}

function ibulBack(g: Grid, W: number, H: number): void {
  const bot = H - 4;
  g.rect(1, 2, W - 2, 3, PINE.hi);
  g.rect(2, 5, W - 4, bot - 5, PINE.lo);
  for (let x = 6; x < W - 3; x += 6) g.vline(x, 5, bot - 1, PINE.line);
  g.rect(3, bot, 2, H - bot - 1, PINE.line);
  g.rect(W - 5, bot, 2, H - bot - 1, PINE.line);
  foot(g, 2, W - 3, H - 1);
}

// ════════════════ 촌캉스 밥상 (2×1, 둥근 소반) ════════════════

const LACQ_RED = { hi: 0xc06a44, mid: 0x9a4a2c, lo: 0x6e3018 } as const;

/** 밥그릇·국그릇·반찬 접시 */
function dishes(g: Grid, pts: readonly [number, number, string][]): void {
  for (const [x, y, k] of pts) {
    if (k === "rice") {
      g.rect(x, y, 4, 3, 0xf4f0e6);
      g.hline(x, x + 3, y, 0xffffff);
      g.set(x + 1, y + 2, 0xc8c0b0);
    } else if (k === "soup") {
      g.rect(x, y, 4, 3, 0x8a5a3a);
      g.hline(x, x + 3, y, 0xd89a5a);
    } else if (k === "kimchi") {
      g.rect(x, y, 3, 2, 0xf0ece0);
      g.rect(x, y, 3, 1, 0xd84a32);
    } else if (k === "greens") {
      g.rect(x, y, 3, 2, 0xf0ece0);
      g.rect(x, y, 3, 1, 0x6aa04a);
    } else {
      g.rect(x, y, 3, 2, 0xf0ece0);
      g.rect(x, y, 3, 1, 0xe8b850);
    }
  }
}

function bapsangFront(g: Grid, W: number, H: number, back: boolean): void {
  // 둥근 상판 (가장자리 테 + 윤기) · 휘어진 다리 넷
  const cy = 8;
  g.ellipse(W / 2, cy, W / 2 - 1.5, 6.5, LACQ_RED.lo);
  g.ellipse(W / 2, cy - 0.5, W / 2 - 2.5, 5.5, LACQ_RED.mid);
  for (let x = 6; x < W / 2; x++) g.set(x, 4, LACQ_RED.hi);
  g.rect(4, cy + 5, W - 8, 2, LACQ_RED.lo);
  for (const lx of [5, 11, W - 12, W - 6]) {
    g.vline(lx, cy + 7, H - 3, 0x4a2014);
    g.set(lx + (lx < W / 2 ? -1 : 1), H - 3, 0x4a2014);
  }
  dishes(
    g,
    back
      ? [
          [W - 11, 5, "rice"],
          [7, 5, "rice"],
          [W / 2 - 2, 4, "soup"],
          [11, 9, "greens"],
          [W - 15, 9, "kimchi"],
          [W / 2 - 1, 9, "egg"],
        ]
      : [
          [7, 6, "rice"],
          [W - 11, 6, "rice"],
          [W / 2 - 2, 5, "soup"],
          [11, 3, "kimchi"],
          [W - 15, 3, "greens"],
          [W / 2 - 1, 9, "egg"],
        ],
  );
  foot(g, 3, W - 4, H - 1);
}

function bapsangSide(g: Grid, W: number, H: number): void {
  const cx = W / 2;
  g.ellipse(cx, H / 2 - 2, W / 2 - 1.5, H / 2 - 5, LACQ_RED.lo);
  g.ellipse(cx, H / 2 - 2.5, W / 2 - 2.5, H / 2 - 6, LACQ_RED.mid);
  for (let y = 6; y < H / 2 - 4; y++) g.set(3, y, LACQ_RED.hi);
  g.rect(3, H - 9, W - 6, 2, LACQ_RED.lo);
  for (const lx of [4, W - 5]) g.vline(lx, H - 7, H - 3, 0x4a2014);
  dishes(g, [
    [cx - 2, 6, "rice"],
    [cx - 2, H - 16, "rice"],
    [cx - 2, H / 2 - 4, "soup"],
    [4, 11, "kimchi"],
    [W - 7, H / 2 + 1, "greens"],
  ]);
  foot(g, 2, W - 3, H - 1);
}

// ════════════════ 모아 내보내기 ════════════════

export const CAMP_DRAW: Record<string, Draw> = {
  fx_cv_bed: (g, W, H) => bedFront(g, W, H, CV_BED),
  fx_pn_bed: (g, W, H) => bedFront(g, W, H, PN_BED),
  fx_cv_dinette: (g, W, H) => dinetteFront(g, W, H, false),
  fx_cv_kitchen: cvKitchenFront,
  fx_cv_toilet: (g, W, H, v) => toiletBooth(g, W, H, "front", has(v, "open")),
  fx_pn_tv: tvFront,
  fx_pn_sofa: (g, W, H) => sofaFront(g, W, H),
  fx_pn_kitchen: pnKitchenFront,
  fx_rr_jagae: jagaeFront,
  fx_rr_ibul: ibulFront,
  fx_rr_bapsang: (g, W, H) => bapsangFront(g, W, H, false),
};

export const CAMP_SPIN: Record<string, SpinArt> = {
  fx_cv_bed: { side: (g, W, H) => bedSide(g, W, H, CV_BED), back: (g, W, H) => bedBack(g, W, H, CV_BED) },
  fx_pn_bed: { side: (g, W, H) => bedSide(g, W, H, PN_BED), back: (g, W, H) => bedBack(g, W, H, PN_BED) },
  fx_cv_dinette: { side: (g, W, H) => dinetteSide(g, W, H), back: (g, W, H) => dinetteFront(g, W, H, true) },
  fx_cv_kitchen: { side: cvKitchenSide, back: (g, W, H) => cvKitchenBack(g, W, H) },
  fx_cv_toilet: { side: (g, W, H) => toiletBooth(g, W, H, "side", false), back: (g, W, H) => toiletBooth(g, W, H, "back", false) },
  fx_pn_tv: { side: tvSide, back: tvBack },
  fx_pn_sofa: { side: (g, W, H) => sofaSide(g, W, H), back: (g, W, H) => sofaBack(g, W, H) },
  fx_pn_kitchen: { side: pnKitchenSide, back: (g, W, H) => pnKitchenBack(g, W, H) },
  fx_rr_jagae: { side: jagaeSide, back: (g, W, H) => jagaeBack(g, W, H) },
  fx_rr_ibul: { side: ibulSide, back: (g, W, H) => ibulBack(g, W, H) },
  fx_rr_bapsang: { side: (g, W, H) => bapsangSide(g, W, H), back: (g, W, H) => bapsangFront(g, W, H, true) },
};

/** 캠핑장 기본 가구 그림인지 (테 색) */
export const isCampArt = (id: string) => id in CAMP_DRAW;
/** 자개가 반짝이는 가구 (집 씬이 연못 장면과 같은 박자로 g0~g3을 넘긴다) */
export const CAMP_GLINT: ReadonlySet<string> = new Set(["fx_rr_jagae"]);

// ════════════════ 바닥 (16×16) ════════════════

export const CAMP_FLOORS: Record<string, Tile> = {
  // 카라반: 따뜻한 갈색 가로 널 (4줄). 이음매는 줄마다 두세 칸에 한 번만 — 벽돌처럼 보이지 않게 긴 널로
  floor_caravan: (g, v) => {
    const tones = [0xc4884e, 0xbe8248, 0xca8e54, 0xc0844a];
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const c = tones[(row + v) % 4];
      g.rect(0, y, 16, 4, c);
      g.hline(0, 15, y, lighten(c, 0.08));
      g.hline(0, 15, y + 3, 0x8e5a30);
      if ((row * 3 + v) % 3 === 0) g.vline((row * 9 + v * 5) % 16, y, y + 2, 0x8e5a30);
      g.set((row * 5 + v * 7 + 3) % 16, y + 1, darken(c, 0.08));
      g.set((row * 5 + v * 7 + 4) % 16, y + 1, darken(c, 0.08));
    }
  },
  // 펜션: 넓은 원목 마루 (8px 널 두 줄, 결무늬, 이음매는 가끔)
  floor_pension: (g, v) => {
    const tones = [0xd6ac74, 0xdab07a, 0xd2a870, 0xd8ae76];
    for (let row = 0; row < 2; row++) {
      const y = row * 8;
      const c = tones[(row * 2 + v) % 4];
      g.rect(0, y, 16, 8, c);
      g.hline(0, 15, y, lighten(c, 0.12));
      g.hline(0, 15, y + 7, 0xa27c4e);
      if ((row + v) % 2 === 0) g.vline((row * 11 + v * 7) % 16, y + 1, y + 6, 0xa27c4e);
      // 나뭇결 (가로로 흐르는 옅은 줄)
      for (let x = 0; x < 16; x++) {
        const k = Math.round(3 + Math.sin((x + v * 5 + row * 3) / 3) * 1.2);
        if (hash2(x, row, v + 7) > 0.35) g.set(x, y + k, darken(c, 0.06));
      }
    }
  },
  // 촌캉스: 노란 장판 (콩댐 윤기 + 칸마다 아주 옅은 이음선 — 큰 네모 무늬)
  floor_rural: (g, v) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = hash2(x + v * 17, y, 5) * 0.1;
        g.set(x, y, mix(0xe2aa4c, 0xf0c46a, 0.4 + n - y / 80));
      }
    g.hline(0, 15, 0, 0xd49a42);
    g.vline(0, 0, 15, 0xd49a42);
    if (v === 1) for (let i = 0; i < 3; i++) g.set(6 + i, 8 + i, 0xf6d48a);
  },
};

// ════════════════ 벽 (16×40 — art.ts wallGrid가 천장 테·몰딩·걸레받이를 두른다) ════════════════

const PAPER_Y0 = 6;
const PAPER_Y1 = 40 - 6;

export const CAMP_PAPERS: Record<string, Tile> = {
  // 카라반: 밝은 자작나무 세로 판 (판마다 옅은 결)
  wall_caravan: (g, v) => {
    for (let x = 0; x < 16; x += 4) {
      const c = (x / 4 + v) % 2 ? 0xead09a : 0xe0c48c;
      g.rect(x, PAPER_Y0, 4, PAPER_Y1 - PAPER_Y0 + 1, c);
      g.vline(x + 3, PAPER_Y0, PAPER_Y1, 0xb8946a);
      g.vline(x, PAPER_Y0, PAPER_Y1, lighten(c, 0.15));
      g.set(x + 1, PAPER_Y0 + 8 + ((x + v * 3) % 9), darken(c, 0.12));
    }
    // 가운데 가로 손잡이 레일
    g.hline(0, 15, 22, 0xa8804c);
    g.hline(0, 15, 23, 0xc8a070);
  },
  // 펜션: 통나무를 가로로 쌓은 벽 (둥근 통나무 6줄)
  wall_pension: (g, v) => {
    for (let row = 0; PAPER_Y0 + row * 6 <= PAPER_Y1; row++) {
      const y = PAPER_Y0 + row * 6;
      const shade = ((row + v) % 3) * 0.05;
      const rows: Color[] = [0xd8a466, 0xc89052, 0xb47c42, 0x9a6634, 0x7e522a, 0x4e321a];
      for (let j = 0; j < 6 && y + j <= PAPER_Y1; j++) for (let x = 0; x < 16; x++) g.set(x, y + j, darken(rows[j], shade));
      // 옹이
      if ((row + v) % 3 === 1) {
        const kx = (row * 5 + v * 3) % 13 + 1;
        g.set(kx, y + 2, 0x7a4a24);
        g.set(kx + 1, y + 2, 0x8a5a2c);
      }
    }
  },
  // 촌캉스: 한지 바른 흰 벽 + 나무 기둥(네 칸마다) + 가로 인방 + 아래 나무 징두리
  wall_rural: (g, v) => {
    for (let y = PAPER_Y0; y <= PAPER_Y1; y++) for (let x = 0; x < 16; x++) g.set(x, y, mix(0xf4ecd8, 0xe8dcc0, hash2(x, y, 9) * 0.5 + (y - PAPER_Y0) / 80));
    // 가로 인방
    g.rect(0, 17, 16, 2, PINE.mid);
    g.hline(0, 15, 17, PINE.hi);
    // 징두리 (아래 나무 판)
    g.rect(0, PAPER_Y1 - 6, 16, 7, PINE.mid);
    g.hline(0, 15, PAPER_Y1 - 6, PINE.hi);
    g.vline(8, PAPER_Y1 - 5, PAPER_Y1, PINE.lo);
    if (v === 0) {
      g.rect(0, PAPER_Y0, 3, PAPER_Y1 - PAPER_Y0 + 1, PINE.lo);
      g.vline(1, PAPER_Y0, PAPER_Y1, PINE.mid);
    }
  },
};

/** 옆벽·칸막이 윗면 색 */
export const CAMP_WALL_CAP: Record<string, Color> = { wall_caravan: 0x8a6a44, wall_pension: 0x5a3a1e, wall_rural: 0x5a3a22 };

// ════════════════ 창문 (안쪽 벽, 기본 창문 자리 — 32×24 기준, 펜션 통창만 넓다) ════════════════

/** 집 창문이 기본일 때 종류별 창문 이름 (art.ts windowGrid의 style) */
export const CAMP_WINDOW_STYLE = { caravan: "camp_caravan", pension: "camp_pension", rural: "camp_rural" } as const;
export const isCampWindowStyle = (s: string): s is (typeof CAMP_WINDOW_STYLE)[keyof typeof CAMP_WINDOW_STYLE] => s === "camp_caravan" || s === "camp_pension" || s === "camp_rural";

/** 펜션 통창 너비 (기본 창문 32보다 넓다 — 집 씬이 가운데를 맞춘다) */
export const PENSION_WINDOW_W = 44;

function sky(g: Grid, x0: number, y0: number, x1: number, y1: number, night: boolean): void {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    g.hline(x0, x1, y, night ? mix(0x141c34, 0x283252, t) : mix(0x86c0ea, 0xd6eefa, t));
  }
}

/** 카라반 둥근 창 (알루미늄 테, 32×24 안 가운데) */
function caravanWindow(night: boolean, open: boolean): Grid {
  const g = new Grid(32, 24);
  const cx = 16;
  const cy = 11;
  g.ellipse(cx, cy, 9, 9, STEEL.lo);
  g.ellipse(cx, cy, 8, 8, STEEL.hi);
  g.ellipse(cx, cy, 6.6, 6.6, STEEL.dark);
  // 유리 안 하늘
  for (let y = cy - 6; y <= cy + 6; y++)
    for (let x = cx - 6; x <= cx + 6; x++) {
      const dx = (x + 0.5 - cx) / 6;
      const dy = (y + 0.5 - cy) / 6;
      if (dx * dx + dy * dy > 1) continue;
      const t = (y - (cy - 6)) / 12;
      g.set(x, y, night ? mix(0x141c34, 0x283252, t) : mix(0x86c0ea, 0xd6eefa, t));
    }
  if (night) {
    for (const [x, y] of [[13, 8], [18, 7], [15, 13], [20, 12]]) g.set(x, y, 0xf0f0ff);
    g.ellipse(18.5, 9, 1.6, 1.6, 0xf2ecc8);
  } else {
    g.ellipse(14, 9, 3, 1.4, 0xffffff);
    for (let x = cx - 5; x <= cx + 5; x++) g.vline(x, cy + 3 + Math.round(Math.sin(x / 1.6)), cy + 5, 0x5a8a5a);
  }
  if (open) {
    // 위로 젖혀 연 유리창 (위 경첩 — 납작한 타원)
    g.ellipse(cx, cy - 9, 7, 2, STEEL.mid);
    g.ellipse(cx, cy - 9, 5.5, 1.2, night ? 0x3a4a6a : 0xbcdcf0);
  } else {
    // 유리 반사 + 리벳
    g.set(cx - 3, cy - 3, night ? 0x4a5878 : 0xffffff);
    g.set(cx - 2, cy - 4, night ? 0x4a5878 : 0xffffff);
    g.set(cx - 4, cy - 2, night ? 0x4a5878 : 0xffffff);
  }
  for (let a = 0; a < 8; a++) g.set(Math.round(cx + Math.cos((a * Math.PI) / 4) * 7.6), Math.round(cy + Math.sin((a * Math.PI) / 4) * 7.6), STEEL.lo);
  g.outline(0x1a1612, false, 200);
  return g;
}

/** 펜션 통창 (넓은 유리 + 가는 나무 틀, 창밖 산과 전나무) */
function pensionWindow(night: boolean, open: boolean): Grid {
  const W = PENSION_WINDOW_W;
  const H = 24;
  const g = new Grid(W, H);
  g.rect(0, 0, W, H - 2, WALNUT.mid);
  g.hline(0, W - 1, 0, WALNUT.hi);
  sky(g, 2, 2, W - 3, H - 5, night);
  // 먼 산 둘 + 가까운 전나무
  for (let x = 2; x < W - 2; x++) {
    const m1 = Math.round(11 + Math.sin(x / 5) * 3 + Math.sin(x / 2.3));
    const m2 = Math.round(14 + Math.sin(x / 3.4 + 1) * 2);
    for (let y = m1; y < H - 4; y++) g.set(x, y, night ? 0x24304a : 0x8aaecc);
    for (let y = m2; y < H - 4; y++) g.set(x, y, night ? 0x1c2638 : 0x6a9a7a);
  }
  for (const tx of [7, 15, 30, 37]) for (let j = 0; j < 7; j++) g.hline(tx - Math.floor(j / 2), tx + Math.floor(j / 2), H - 11 + j, night ? 0x142018 : 0x3e6a4a);
  if (night) {
    for (const [x, y] of [[6, 4], [14, 7], [24, 3], [33, 6], [40, 4]]) g.set(x, y, 0xf0f0ff);
    g.ellipse(36, 6, 2.4, 2.4, 0xf2ecc8);
  } else {
    g.ellipse(10, 5, 4, 1.6, 0xffffff);
    g.ellipse(31, 7, 3, 1.4, 0xf4faff);
  }
  if (open) {
    // 여닫이 두 짝을 양옆으로
    g.rect(2, 2, 4, H - 6, WALNUT.hi);
    g.rect(W - 6, 2, 4, H - 6, WALNUT.hi);
    g.vline(4, 3, H - 6, night ? 0x3a4a6a : 0xbcdcf0);
    g.vline(W - 4, 3, H - 6, night ? 0x3a4a6a : 0xbcdcf0);
  } else {
    // 가운데 가는 틀 + 유리 반사
    g.vline(W / 2, 2, H - 5, WALNUT.mid);
    for (let i = 0; i < 5; i++) g.set(5 + i, 10 - i, night ? 0x4a5878 : 0xffffff);
    for (let i = 0; i < 4; i++) g.set(W / 2 + 4 + i, 9 - i, night ? 0x4a5878 : 0xf4fbff);
  }
  // 창턱 (화분 하나)
  g.rect(0, H - 4, W, 2, OAK.mid);
  g.hline(0, W - 1, H - 4, OAK.hi);
  g.rect(-1, H - 2, W + 2, 2, WALNUT.lo);
  g.rect(W - 9, H - 7, 4, 3, 0xc86a3a);
  g.set(W - 8, H - 9, 0x5aa04a);
  g.set(W - 7, H - 8, 0x6ab85a);
  g.set(W - 6, H - 9, 0x5aa04a);
  g.outline(0x1a1612, false, 200);
  return g;
}

/** 촌캉스 한지 창살 창 (띠살창 — 열면 오른짝을 밀어 창밖 감나무) */
function ruralWindow(night: boolean, open: boolean): Grid {
  const W = 32;
  const H = 24;
  const g = new Grid(W, H);
  g.rect(0, 0, W, H - 2, PINE.lo);
  g.hline(0, W - 1, 0, PINE.mid);
  const paper = night ? 0xb8b094 : 0xf6eed6;
  const paperShade = night ? 0xa8a084 : 0xeadfc2;
  g.rect(2, 2, W - 4, H - 6, paper);
  if (open) {
    // 오른짝을 밀어 열었다: 창밖 (하늘 + 감나무 가지)
    sky(g, W / 2, 2, W - 3, H - 5, night);
    for (let i = 0; i < 10; i++) g.set(W / 2 + 2 + i, 12 - Math.round(i / 2), night ? 0x1a1410 : 0x5a3a22);
    if (!night) {
      g.set(W / 2 + 5, 11, 0xf08a22);
      g.set(W / 2 + 9, 9, 0xf08a22);
      g.set(W / 2 + 10, 10, 0xf08a22);
    }
  }
  // 띠살 (세로 살 촘촘 + 가로 살 위·가운데·아래)
  const x1 = open ? W / 2 - 1 : W - 3;
  for (let x = 4; x <= x1; x += 3) g.vline(x, 2, H - 5, PINE.mid);
  for (const y of [5, 11, 17]) g.hline(2, x1, y, PINE.mid);
  for (let y = 2; y < H - 4; y++) if (y % 4 === 1) g.hline(2, x1, y, paperShade);
  g.vline(W / 2, 2, H - 5, PINE.lo);
  if (open) {
    // 밀어 둔 짝이 왼짝 위에 겹친다
    g.vline(W / 2 - 1, 2, H - 5, PINE.line);
  }
  // 문고리
  g.set(W / 2 - 2, 12, BRASS.mid);
  g.set(W / 2 + 2, 12, BRASS.mid);
  g.rect(0, H - 4, W, 2, PINE.mid);
  g.hline(0, W - 1, H - 4, PINE.hi);
  g.rect(-1, H - 2, W + 2, 2, PINE.line);
  g.outline(0x1a1612, false, 200);
  return g;
}

/** 캠핑장 집 종류별 기본 창문 그림 */
export function campWindowGrid(style: string, night: boolean, open: boolean): Grid {
  if (style === "camp_pension") return pensionWindow(night, open);
  if (style === "camp_rural") return ruralWindow(night, open);
  return caravanWindow(night, open);
}
