import type * as Phaser from "phaser";
import { hash2, makeCanvas } from "../sprites/pixel";

// 11/15 야근 빌딩 그림 (코드로 그리는 픽셀아트, 브라우저에서만). 마을 소품(sprites/worldProps)처럼 한 번 그려 텍스처로 쓴다.
//  - 건물 한 장: 어두운 남색 고층 빌딩 (옥상 안테나·간판틀 → 지붕 왕관 → 창 12층 × 6칸 + 옆면 → 유리 로비·차양·회전문)
//  - 빛 층 한 장: 불 켜진 창·로비 유리·왕관 불빛만 (ADD — 밤이면 진해진다)
//  - 옥상 간판 글씨 "야근 빌딩" (분홍 네온) + 빛 층, 회전문 3장(돌아간다), 창 하나 크기 빛(깜빡이는 창), 빨간 항공등

export const TTEX = {
  body: "tower-body",
  glow: "tower-glow",
  sign: "tower-sign",
  signGlow: "tower-sign-glow",
  door: "tower-door",
  pane: "tower-pane",
  beacon: "tower-beacon",
} as const;

/** 그림 크기 (바닥 가운데가 원점) */
export const TOWER_W = 68;
export const TOWER_H = 170;
/** 간판 판 (그림 왼쪽 위 기준): 글씨는 이 판 가운데에 */
export const SIGN_BOX = { x: 5, y: 21, w: 58, h: 14 } as const;
/** 회전문 (그림 왼쪽 위 기준) */
export const DOOR_BOX = { x: 26, y: 149, w: 16, h: 21 } as const;
/** 항공등 (안테나 꼭대기) */
export const BEACON_AT = { x: 43, y: 1 } as const;

type Ctx = CanvasRenderingContext2D;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
function px(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
  a = 1,
): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = hex(c);
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

function add(
  scene: Phaser.Scene,
  key: string,
  canvas: HTMLCanvasElement,
  frame?: { w: number; h: number },
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex || !frame) return;
  const cols = Math.floor(canvas.width / frame.w);
  for (let i = 0; i < cols; i++)
    tex.add(i, 0, i * frame.w, 0, frame.w, frame.h);
}

// ── 창 ──

/** 창 칸: 앞면 6칸 × 12층 (6×5 px), 옆면 1칸 (3×5) */
const COLS = 6;
const ROWS = 12;
const WIN_X0 = 8;
const WIN_Y0 = 52;
const WIN_DX = 8;
const WIN_DY = 7;
export type TowerWindow = {
  x: number;
  y: number;
  w: number;
  h: number;
  lit: "warm" | "cool" | null;
  side: boolean;
};

/** 창마다 불이 켜졌는지 (정해진 무늬 — 야근하는 층은 불이 몰려 있다) */
export function towerWindows(): TowerWindow[] {
  const out: TowerWindow[] = [];
  for (let r = 0; r < ROWS; r++) {
    // 층마다 야근 정도가 다르다 (몇 층은 거의 다 켜져 있고, 몇 층은 텅 비었다)
    const busy = hash2(r, 7, 31);
    for (let c = 0; c < COLS; c++) {
      const u = hash2(c, r, 11);
      const on = u < 0.18 + busy * 0.62;
      const cool = hash2(c, r, 5) < 0.22;
      out.push({
        x: WIN_X0 + c * WIN_DX,
        y: WIN_Y0 + r * WIN_DY,
        w: 6,
        h: 5,
        lit: on ? (cool ? "cool" : "warm") : null,
        side: false,
      });
    }
    const su = hash2(9, r, 3);
    out.push({
      x: 57,
      y: WIN_Y0 + r * WIN_DY,
      w: 3,
      h: 5,
      lit: su < 0.25 + busy * 0.4 ? "warm" : null,
      side: true,
    });
  }
  return out;
}

/** 밤에 따로 깜빡이는 창 (빛 층에서는 빼고 TowerView가 창 하나씩 켰다 껐다 한다) */
export function towerFlickers(n = 7): TowerWindow[] {
  const lit = towerWindows().filter((w) => w.lit && !w.side);
  const out: TowerWindow[] = [];
  for (let i = 0; i < n && lit.length; i++) {
    const w = lit[(i * 11 + 3) % lit.length];
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** 로비 양옆 유리 칸 (x 시작·끝) */
const LOBBY_GLASS: readonly (readonly [number, number])[] = [
  [5, 15],
  [53, 63],
];

const C = {
  ink: 0x07080d,
  front: 0x1d2131,
  frontHi: 0x283046,
  side: 0x121522,
  mullion: 0x2b3247,
  band: 0x323a52,
  glass: 0x16213a,
  glassHi: 0x2b3d63,
  glassSide: 0x0f1628,
  warm: 0xe2b664,
  warmHi: 0xffe3a6,
  cool: 0xa9c8ea,
  coolHi: 0xe4f2ff,
  steel: 0x3d4459,
  steelHi: 0x59627c,
  lobby: 0x2a3a46,
  lobbyLit: 0xd8b878,
  stone: 0x55596a,
  stoneHi: 0x737889,
};

function bodyCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(TOWER_W, TOWER_H);
  // 안테나 (오른쪽으로 비켜 선 큰 것 + 왼쪽 작은 것)
  px(ctx, 42, 2, 2, 18, C.steel);
  px(ctx, 42, 2, 1, 18, C.steelHi);
  px(ctx, 41, 7, 4, 1, C.steel);
  px(ctx, 41, 12, 4, 1, C.steel);
  px(ctx, 20, 10, 1, 10, C.steel);
  px(ctx, 19, 10, 3, 1, C.steelHi);
  // 옥상 실외기·물탱크 (간판 뒤)
  px(ctx, 8, 15, 10, 7, C.ink);
  px(ctx, 9, 16, 8, 6, C.steel);
  px(ctx, 10, 17, 3, 3, C.side);
  px(ctx, 48, 13, 12, 9, C.ink);
  px(ctx, 49, 14, 10, 8, 0x4a4f63);
  px(ctx, 49, 14, 10, 1, C.steelHi);
  // 간판 (왕관 위에 얹은 철골 판)
  const S = SIGN_BOX;
  px(ctx, S.x - 1, S.y - 1, S.w + 2, S.h + 2, C.ink);
  px(ctx, S.x, S.y, S.w, S.h, 0x120c16);
  px(ctx, S.x, S.y, S.w, 1, 0x2a1c2e);
  px(ctx, S.x, S.y + S.h - 1, S.w, 1, 0x1c1220);
  for (const x of [S.x + 3, S.x + S.w - 4])
    px(ctx, x, S.y + 2, 1, S.h - 4, 0x2a1c2e);
  // 지붕 난간
  px(ctx, 2, 36, 64, 3, C.ink);
  px(ctx, 3, 36, 62, 2, C.steelHi);
  for (let x = 10; x < 60; x += 12) px(ctx, x, 35, 1, 2, C.steel);
  // 왕관층 (조금 좁게, 세로 지느러미 + 푸른 불빛 띠)
  px(ctx, 5, 38, 54, 12, C.ink);
  px(ctx, 6, 38, 50, 11, C.frontHi);
  for (let x = 7; x < 55; x += 4) {
    px(ctx, x, 39, 2, 9, C.front);
    px(ctx, x, 39, 1, 9, C.band);
  }
  px(ctx, 6, 44, 50, 1, 0x1a2a40);
  for (let x = 8; x < 55; x += 6) px(ctx, x, 44, 2, 1, 0x7ac4ff);
  px(ctx, 56, 39, 3, 10, C.side);
  // 몸통 (앞면 + 오른쪽 옆면 — 깊이). 앞면 오른쪽 끝은 조금 어둡게 (빛이 왼쪽 위에서)
  px(ctx, 4, 49, 59, 89, C.ink);
  px(ctx, 5, 49, 50, 88, C.front);
  px(ctx, 50, 49, 5, 88, 0x1a1d2c);
  px(ctx, 55, 49, 7, 88, C.side);
  px(ctx, 5, 49, 1, 88, C.frontHi);
  px(ctx, 5, 49, 50, 2, C.band);
  // 층 띠 (세 층마다 밝은 줄 — 고층 느낌)
  for (let r = 0; r <= ROWS; r += 3)
    px(ctx, 5, WIN_Y0 - 2 + r * WIN_DY, 50, 1, C.band);
  // 세로 기둥 (가운데 굵게)
  px(ctx, 30, 49, 2, 88, C.mullion);
  // 창
  for (const w of towerWindows()) {
    if (w.side) {
      px(ctx, w.x, w.y, w.w, w.h, w.lit ? 0x8a6a3a : C.glassSide);
      continue;
    }
    if (w.lit) {
      const [base, hi] =
        w.lit === "warm" ? [C.warm, C.warmHi] : [C.cool, C.coolHi];
      px(ctx, w.x, w.y, w.w, w.h, base);
      px(ctx, w.x, w.y, w.w, 1, hi);
      // 블라인드 반쯤 내린 창, 모니터 앞 사람 그림자
      const u = hash2(w.x, w.y, 17);
      if (u < 0.25) px(ctx, w.x, w.y, w.w, 2, 0x8a7448);
      else if (u < 0.45)
        px(ctx, w.x + 1 + (Math.floor(u * 7) % 4), w.y + 2, 2, 3, 0x3a3020);
    } else {
      px(ctx, w.x, w.y, w.w, w.h, C.glass);
      // 하늘이 비친 빗금
      if (hash2(w.x, w.y, 23) < 0.5) {
        px(ctx, w.x, w.y, 2, 1, C.glassHi);
        px(ctx, w.x, w.y + 1, 1, 1, C.glassHi);
      }
    }
  }
  // 로비 (넓은 1층): 돌 기둥 + 유리 + 차양 + 회전문 자리
  px(ctx, 0, 137, 68, 33, C.ink);
  px(ctx, 1, 137, 66, 33, C.lobby);
  px(ctx, 1, 137, 66, 3, C.stoneHi);
  px(ctx, 1, 140, 66, 1, C.stone);
  for (const x of [1, 15, 49, 63]) {
    px(ctx, x, 140, 4, 30, C.stone);
    px(ctx, x, 140, 1, 30, C.stoneHi);
  }
  // 유리 칸 (안이 따뜻하게 밝다)
  for (const [x0, x1] of LOBBY_GLASS) {
    px(ctx, x0, 143, x1 - x0, 23, C.lobbyLit);
    px(ctx, x0, 143, x1 - x0, 2, 0xf6dca0);
    for (let x = x0 + 3; x < x1; x += 4) px(ctx, x, 143, 1, 23, 0x8a7448);
    // 화분
    px(ctx, x0 + 3, 160, 4, 6, 0x4a5a3a);
    px(ctx, x0 + 4, 158, 2, 2, 0x6a8a4a);
  }
  px(ctx, 19, 143, 30, 23, 0x3a4652);
  // 차양 (회전문 위)
  px(ctx, 17, 142, 34, 4, C.ink);
  px(ctx, 18, 142, 32, 2, C.steelHi);
  px(ctx, 18, 144, 32, 1, 0xffe3a6);
  // 회전문 둥근 지붕
  px(ctx, DOOR_BOX.x - 2, DOOR_BOX.y - 2, DOOR_BOX.w + 4, 3, C.steel);
  px(ctx, DOOR_BOX.x - 1, DOOR_BOX.y - 3, DOOR_BOX.w + 2, 1, C.steelHi);
  // 계단 (한 칸)
  px(ctx, 17, 167, 34, 3, C.stoneHi);
  px(ctx, 17, 167, 34, 1, 0x9a9eae);
  return canvas;
}

/** 빛 층: 켜진 창·로비 유리·왕관 불빛만 (밝게) */
function glowCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(TOWER_W, TOWER_H);
  const flick = new Set(towerFlickers().map((w) => `${w.x},${w.y}`));
  for (const w of towerWindows()) {
    if (!w.lit || flick.has(`${w.x},${w.y}`)) continue;
    const c = w.lit === "warm" ? 0xffd890 : 0xcfe6ff;
    px(ctx, w.x - 1, w.y - 1, w.w + 2, w.h + 2, c, 0.25);
    px(ctx, w.x, w.y, w.w, w.h, c, 0.85);
  }
  for (const [x0, x1] of LOBBY_GLASS)
    px(ctx, x0, 143, x1 - x0, 23, 0xffd890, 0.7);
  px(ctx, 18, 144, 32, 1, 0xfff0c0);
  for (let x = 8; x < 55; x += 6) px(ctx, x - 1, 43, 4, 3, 0x7ac4ff, 0.8);
  // 왼쪽 모서리 푸른 선 조명 (고층 빌딩 윤곽)
  px(ctx, 5, 50, 1, 86, 0x7ac4ff, 0.45);
  return canvas;
}

/** 회전문 3장 (유리 날개가 돌아간다): 16×21 */
function doorCanvas(): HTMLCanvasElement {
  const { w, h } = DOOR_BOX;
  const { canvas, ctx } = makeCanvas(w * 3, h);
  for (let f = 0; f < 3; f++) {
    const o = f * w;
    px(ctx, o, 0, w, h, C.ink);
    px(ctx, o + 1, 1, w - 2, h - 1, 0x6a8090);
    px(ctx, o + 1, 1, w - 2, 1, 0xa8c0d0);
    // 안쪽 따뜻한 로비 빛
    px(ctx, o + 3, 4, w - 6, h - 6, 0xd8b878);
    // 날개 (가운데 축 + 비스듬한 판)
    const k = [2, 5, 8][f];
    px(ctx, o + w / 2 - 1, 2, 1, h - 3, 0x2a3440);
    px(ctx, o + k, 3, 1, h - 5, 0xcfe6ff);
    px(ctx, o + w - 1 - k, 3, 1, h - 5, 0x9ab4c8);
    // 바닥 원
    px(ctx, o + 2, h - 2, w - 4, 1, 0x9a9eae);
  }
  return canvas;
}

/** 깜빡이는 창 하나 (흰 빛 — 틴트로 색을 입힌다) */
function paneCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(8, 7);
  px(ctx, 0, 0, 8, 7, 0xffffff, 0.3);
  px(ctx, 1, 1, 6, 5, 0xffffff, 1);
  return canvas;
}

function beaconCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(7, 7);
  px(ctx, 2, 0, 3, 7, 0xff3030, 0.35);
  px(ctx, 0, 2, 7, 3, 0xff3030, 0.35);
  px(ctx, 2, 2, 3, 3, 0xff6a5a, 1);
  px(ctx, 3, 3, 1, 1, 0xffe0d0, 1);
  return canvas;
}

export function ensureTowerTextures(scene: Phaser.Scene): void {
  add(scene, TTEX.body, bodyCanvas());
  add(scene, TTEX.glow, glowCanvas());
  add(scene, TTEX.door, doorCanvas(), { w: DOOR_BOX.w, h: DOOR_BOX.h });
  add(scene, TTEX.pane, paneCanvas());
  add(scene, TTEX.beacon, beaconCanvas());
}

// ── 옥상 간판 글씨 ──
// 11/15: 글꼴(Galmuri 11px)을 이진화하면 "빌"의 ㅂ 속이 메워져 "밀"로 읽혀서, 다섯 글자를 손으로 찍은 점 글씨로 바꿨다.
// 1px 심(흰색) + 둘레 1px 분홍. 양쪽에 심이 있는 1px 틈은 분홍을 넣지 않아 ㅂ·ㄹ 속이 열려 보인다.
const SIGN_GLYPHS: readonly (readonly string[])[] = [
  // 야
  ["       X  ", "       X  ", " XXX   X  ", "X   X  XXX", "X   X  X  ", "X   X  X  ", "X   X  X  ", "X   X  XXX", " XXX   X  ", "       X  ", "       X  ", "       X  "],
  // 근
  [" XXXXXXXX ", "        X ", "        X ", "        X ", "          ", "XXXXXXXXXX", "          ", "          ", " X        ", " X        ", " X        ", " XXXXXXXX "],
  // (띄어쓰기)
  ["   "],
  // 빌
  ["X   X  X ", "X   X  X ", "XXXXX  X ", "X   X  X ", "XXXXX  X ", "         ", "XXXXXXXX ", "       X ", "XXXXXXXX ", "X        ", "XXXXXXXX ", "         "],
  // 딩
  ["XXXXX  X", "X      X", "X      X", "X      X", "XXXXX  X", "       X", "        ", " XXXXX  ", "X     X ", "X     X ", "X     X ", " XXXXX  "],
];
const GLYPH_GAP = 3;

/** 간판 글씨 심 (SIGN_BOX 크기, 가운데 맞춤) */
function signCore(w: number, h: number): (x: number, y: number) => boolean {
  const width = SIGN_GLYPHS.reduce((a, g) => a + g[0].length, 0) + GLYPH_GAP * (SIGN_GLYPHS.length - 1);
  const x0 = Math.floor((w - width) / 2);
  const y0 = Math.floor((h - 12) / 2);
  const set = new Set<number>();
  let gx = x0;
  for (const g of SIGN_GLYPHS) {
    g.forEach((row, y) => [...row].forEach((ch, x) => ch === "X" && set.add((y0 + y) * w + gx + x)));
    gx += g[0].length + GLYPH_GAP;
  }
  return (x, y) => x >= 0 && y >= 0 && x < w && y < h && set.has(y * w + x);
}

const SIGN_FONT = `11px "Galmuri11", "Galmuri9", monospace`;
export const TOWER_SIGN_TEXT = "야근 빌딩";

/** 간판 글씨(분홍 네온: 흰 심 + 분홍 테두리)와 빛 층. 크기 = 간판 판 */
export function ensureTowerSign(scene: Phaser.Scene): void {
  if (scene.textures.exists(TTEX.sign)) return;
  const { w, h } = SIGN_BOX;
  const on = signCore(w, h);
  // 양쪽(좌우 또는 위아래)에 심이 있는 1px 틈은 테두리를 넣지 않는다 (ㅂ·ㄹ 속이 열려 보이게)
  const gap = (x: number, y: number) => (on(x - 1, y) && on(x + 1, y)) || (on(x, y - 1) && on(x, y + 1));
  const near = (x: number, y: number) =>
    !gap(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1));
  const { canvas, ctx } = makeCanvas(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (on(x, y)) px(ctx, x, y, 1, 1, 0xffe4f2);
      else if (near(x, y)) px(ctx, x, y, 1, 1, 0xff3d9a);
    }
  add(scene, TTEX.sign, canvas);
  const { canvas: gc, ctx: g } = makeCanvas(w + 6, h + 6);
  for (let y = -3; y < h + 3; y++)
    for (let x = -3; x < w + 3; x++) {
      if (on(x, y)) px(g, x + 3, y + 3, 1, 1, 0xff7ac0, 1);
      else if (near(x, y)) px(g, x + 3, y + 3, 1, 1, 0xff3d9a, 0.75);
      else if (
        near(x - 1, y) ||
        near(x + 1, y) ||
        near(x, y - 1) ||
        near(x, y + 1)
      )
        px(g, x + 3, y + 3, 1, 1, 0xff3d9a, 0.3);
    }
  add(scene, TTEX.signGlow, gc);
}

/** 간판 글꼴을 불러온 뒤 한 번 부른다 (이미 있으면 바로) */
export function whenTowerFont(cb: () => void): void {
  if (typeof document === "undefined" || !document.fonts) return cb();
  if (document.fonts.check(SIGN_FONT, TOWER_SIGN_TEXT)) return cb();
  document.fonts.load(SIGN_FONT, TOWER_SIGN_TEXT).then(cb, cb);
}
