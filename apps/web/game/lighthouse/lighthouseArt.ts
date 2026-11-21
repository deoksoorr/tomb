import type * as Phaser from "phaser";
import { darken, Grid, hash2, lighten, mix, type Color } from "../sprites/pixel";
import { BOARD_ART_H, BOARD_ART_W, LIGHTHOUSE_ART_FOOT, LIGHTHOUSE_ART_H, LIGHTHOUSE_ART_W } from "./lighthouseLayout";

// 11/20 「판교의 등대」 그림 (코드로 그리는 픽셀아트, 브라우저에서만 — 11/18 시안 lighthouse()를 마을 그림 규칙으로 옮겼다).
//  - 몸 한 장: 빨강·흰 줄무늬 탑 + 작은 창 둘 + 나무 문 + 돌 받침, 위에 갤러리 난간·유리 등실·빨간 지붕·피뢰침
//  - 빛 층 한 장: 등실 유리·창·문 위 등만 (ADD — 밤이면 진해진다)
//  - 전광판 판 한 장 (다리 둘 위 검은 LED 판) + 흐르는 글씨 띠 (같은 글을 두 번 이어 붙여 잘라 보며 민다) + 그 빛 띠
//  (빛줄기·빛 웅덩이 그림은 BeamView)
// 모두 한 번만 굽는다 (매 프레임 다시 그리지 않는다).

export const LTEX = {
  body: "lighthouse-body",
  glow: "lighthouse-glow",
  board: "lighthouse-board",
  led: "lighthouse-led",
  ledGlow: "lighthouse-led-glow",
} as const;

/** 전광판 LED 창 (판 그림 왼쪽 위 기준): 글씨 띠는 이 창만큼 잘라 보인다 */
export const LED_BOX = { x: 4, y: 5, w: 26, h: 7 } as const;
/** 흐르는 글 (3×5 점 글씨 — 영문 대문자·숫자·기호만) */
export const LED_TEXT = "PANGYO LIGHTHOUSE * CEO 1:1 MEETING * ";
/** 이번 주 노멀·헬 현재 1위가 있으면 그 피해 (UI가 lighthouse:board로 준다 — components/chairman/chairText ledLine) */

const OUT = 0x1f1d1a;
const RED = { hi: 0xe0604c, mid: 0xbf402f, lo: 0x8c2a22 };
const PAINT = { hi: 0xf8f5ee, mid: 0xe4e1d8, lo: 0xa9adb4 };
const STONE = { hi: 0xa4a297, mid: 0x8a887e, lo: 0x67655d, line: 0x4a4943 };
const STEEL = { hi: 0x7a8296, mid: 0x5a6276, lo: 0x3e4456 };
const GLASS = { lit: 0xfff2b8, hi: 0xfffbe0, core: 0xffd860, frame: 0x8a8a7a };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1 || g.filled(x, y)) continue;
      // 가장자리는 체크무늬로 옅게
      if (d > 0.55 && (x + y) & 1) continue;
      g.set(x, y, 0x000000, d > 0.55 ? Math.round(a * 0.8) : a);
    }
}

/** 등대 몸 + 빛 층 (같은 좌표). 탑 꼭대기(갤러리 바닥) y = TOP */
const TOP = 38;
function drawLighthouse(): { g: Grid; em: Grid } {
  const W = LIGHTHOUSE_ART_W;
  const H = LIGHTHOUSE_ART_H;
  const g = new Grid(W, H);
  const em = new Grid(W, H);
  const cx = (W - 1) / 2;
  const lx = Math.round(cx);
  const base = H - LIGHTHOUSE_ART_FOOT;
  const half = (y: number) => 7.5 + ((y - TOP) / (base - TOP)) * 5;
  const BAND = 13;
  // 줄무늬 탑 (아래가 넓다, 빛은 왼쪽 위에서). 띠 아랫줄은 어두운 이음매
  for (let y = TOP; y <= base - 6; y++) {
    const red = Math.floor((y - TOP) / BAND) % 2 === 0;
    const pal = red ? RED : PAINT;
    const hw = half(y);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const rel = (x - cx) / hw;
      let c: Color = rel < -0.5 ? pal.hi : rel > 0.3 ? pal.lo : pal.mid;
      if (Math.abs(rel - 0.3) < 0.08 && (x + y) % 2) c = pal.mid;
      if ((y - TOP) % BAND === BAND - 1) c = red ? RED.lo : 0x8a90a0;
      g.set(x, y, c);
    }
  }
  // 나무 문 + 문 위 작은 등
  g.rect(lx - 3, base - 17, 7, 12, 0x4a321e);
  g.rect(lx - 2, base - 18, 5, 1, 0x4a321e);
  g.rect(lx - 2, base - 16, 2, 10, 0x6a4a2c);
  g.rect(lx + 1, base - 16, 2, 10, 0x5a3e26);
  g.vline(lx, base - 17, base - 6, 0x2c1c10);
  g.set(lx + 2, base - 11, 0xe8c070);
  g.rect(lx - 1, base - 21, 3, 2, 0x3a3640);
  g.set(lx, base - 20, 0xffe3a6);
  em.set(lx, base - 20, 0xffe8b0);
  em.set(lx - 1, base - 20, 0xffc870);
  em.set(lx + 1, base - 20, 0xffc870);
  // 작은 창 둘 (불 켜진 계단참)
  for (const wy of [TOP + 18, TOP + 44]) {
    g.rect(lx - 1, wy - 1, 3, 1, darken(RED.lo, 0.2));
    g.rect(lx - 1, wy, 3, 5, 0x20304a);
    g.set(lx - 1, wy, 0x5a7aa0);
    for (let y = 0; y < 5; y++) for (let x = -1; x <= 1; x++) em.set(lx + x, wy + y, y < 2 ? 0xffe8a8 : 0xf0c070);
  }
  // 돌 받침 (벽돌 엇갈림)
  for (let y = base - 6; y <= base; y++) {
    const hw = 12.5 + (y - (base - 6)) * 0.5;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const row = (y - (base - 6)) >> 1;
      const off = (row & 1) * 3;
      const brick = Math.floor((x + off) / 6);
      const mortar = (x + off) % 6 === 0 || (y - (base - 6)) % 2 === 1;
      const rel = (x - cx) / hw;
      const c = mortar ? STONE.lo : rel < -0.4 ? STONE.hi : rel > 0.45 ? mix(STONE.mid, STONE.lo, 0.5) : hash2(brick, row, 4) < 0.4 ? STONE.mid : 0x96948a;
      g.set(x, y, c);
    }
  }
  g.hline(Math.floor(cx - 12.5), Math.ceil(cx + 12.5), base - 6, STONE.hi);
  // 문 앞 디딤돌
  g.rect(lx - 4, base - 5, 9, 1, STONE.hi);
  g.rect(lx - 4, base - 4, 9, 1, STONE.mid);
  // 갤러리 (바닥 + 난간)
  g.rect(lx - 15, TOP - 2, 31, 3, STEEL.mid);
  g.hline(lx - 15, lx + 15, TOP - 2, STEEL.hi);
  g.hline(lx - 15, lx + 15, TOP, STEEL.lo);
  for (let x = lx - 14; x <= lx + 14; x += 3) g.vline(x, TOP - 8, TOP - 3, 0x4a5064);
  g.hline(lx - 15, lx + 15, TOP - 8, 0x6a7288);
  g.hline(lx - 15, lx + 15, TOP - 5, 0x56607a);
  // 갤러리 받침 까치발 (탑 어깨)
  for (const dx of [-9, 9]) {
    g.set(lx + dx, TOP + 1, STEEL.lo);
    g.set(lx + dx + Math.sign(dx), TOP + 1, STEEL.lo);
    g.set(lx + dx, TOP + 2, STEEL.lo);
  }
  // 등실 (유리 + 기둥) — 가운데 등불은 빛 층에서 하얗게
  g.rect(lx - 7, TOP - 20, 15, 11, GLASS.lit);
  g.rect(lx - 7, TOP - 20, 15, 2, GLASS.hi);
  for (const x of [lx - 3, lx + 4]) g.vline(x, TOP - 20, TOP - 10, GLASS.frame);
  for (const x of [lx - 7, lx + 7]) g.vline(x, TOP - 20, TOP - 10, RED.lo);
  g.rect(lx - 2, TOP - 17, 6, 6, GLASS.core);
  g.rect(lx - 1, TOP - 16, 3, 3, 0xffffff);
  g.rect(lx - 9, TOP - 10, 19, 2, RED.mid);
  g.hline(lx - 9, lx + 9, TOP - 10, RED.hi);
  for (let y = TOP - 20; y <= TOP - 10; y++)
    for (let x = lx - 6; x <= lx + 7; x++)
      if (x !== lx - 3 && x !== lx + 4 && y < TOP - 10) em.set(x, y, x >= lx - 2 && x <= lx + 3 && y >= TOP - 17 && y <= TOP - 12 ? 0xffffff : 0xfff0a0);
  // 빨간 지붕 (뾰족 모자) + 피뢰침 + 꼭대기 공
  for (let y = 0; y < 11; y++) {
    const hw = 1 + y * 0.78;
    for (let x = Math.floor(lx - hw); x <= Math.ceil(lx + hw); x++) g.set(x, TOP - 31 + y, x < lx - hw * 0.4 ? RED.hi : x > lx + hw * 0.3 ? RED.lo : RED.mid);
  }
  g.hline(lx - 9, lx + 9, TOP - 21, RED.lo);
  g.vline(lx, TOP - 36, TOP - 32, 0x8a8a7a);
  g.set(lx, TOP - 37, 0xf2c46b);
  g.outline(OUT);
  shadow(g, cx + 5, base + 1, 19, 3.2, 62);
  return { g, em };
}

export function bodyCanvas(): HTMLCanvasElement {
  return drawLighthouse().g.toCanvas();
}

/** 빛 층: 등실·창·문 등 + 둘레 1px 번짐 */
export function glowCanvas(): HTMLCanvasElement {
  const { em } = drawLighthouse();
  const g = new Grid(em.w, em.h);
  for (let y = 0; y < em.h; y++)
    for (let x = 0; x < em.w; x++) {
      if (em.filled(x, y)) continue;
      const n = [em.get(x - 1, y), em.get(x + 1, y), em.get(x, y - 1), em.get(x, y + 1)].find((v) => (v & 255) > 0);
      if (n) g.set(x, y, n >>> 8, 70);
    }
  g.draw(em, 0, 0);
  return g.toCanvas();
}

/** 전광판 판: 검은 LED 판 + 강철 테 + 다리 둘 + 위 작은 등 줄 (글씨 창은 비워 둔다) */
function boardCanvas(): HTMLCanvasElement {
  const W = BOARD_ART_W;
  const H = BOARD_ART_H;
  const g = new Grid(W, H);
  const B = LED_BOX;
  // 다리 (아래 받침돌)
  for (const x of [7, W - 9]) {
    g.rect(x, B.y + B.h + 2, 2, H - (B.y + B.h + 2) - 3, STEEL.mid);
    g.vline(x, B.y + B.h + 2, H - 4, STEEL.hi);
    g.rect(x - 1, H - 4, 4, 2, STONE.mid);
    g.hline(x - 1, x + 2, H - 4, STONE.hi);
  }
  // 판 테
  g.rect(1, 2, W - 2, B.h + 7, STEEL.lo);
  g.hline(1, W - 2, 2, STEEL.hi);
  g.rect(2, 3, W - 4, B.h + 5, 0x1a1c24);
  // 위 덮개 (빗물막이)
  g.rect(0, 1, W, 2, STEEL.mid);
  g.hline(0, W - 1, 1, STEEL.hi);
  // LED 창 (꺼진 점 무늬)
  g.rect(B.x - 1, B.y - 1, B.w + 2, B.h + 2, 0x0c0c12);
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) if ((x + y) % 2 === 0) g.set(B.x + x, B.y + y, 0x221418);
  // 판 아래 이름 띠 (작은 금빛 점 넷)
  for (const x of [13, 15, 18, 20]) g.set(x, B.y + B.h + 1, 0xc8a050);
  g.outline(OUT);
  shadow(g, W / 2 + 2, H - 2, W / 2 - 1, 2, 56);
  return g.toCanvas();
}

// ── LED 점 글씨 (3×5, 별은 5×5) ──
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "011", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ":": ["0", "1", "0", "1", "0"],
  ",": ["00", "00", "00", "01", "10"],
  ".": ["0", "0", "0", "0", "1"],
  "#": ["01010", "11111", "01010", "11111", "01010"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["00", "00", "00", "00", "00"],
  "*": ["00100", "11111", "01110", "01010", "10001"],
};

/** 글자마다 [x, 폭, 별인지] (1px 띄움) */
function ledLayout(text: string): { cells: { x: number; ch: string }[]; width: number } {
  const cells: { x: number; ch: string }[] = [];
  let x = 0;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    cells.push({ x, ch });
    x += g[0].length + 1;
  }
  return { cells, width: x };
}

/** 글 한 바퀴 폭 (px) — 띠는 이 두 배 + 창 폭 */
export const LED_LOOP = ledLayout(LED_TEXT).width;
export const ledLoop = (text: string) => ledLayout(text).width;

/** 글씨 띠: 글을 두 번 이어 그린다 (잘라 보는 창이 한 바퀴 밀리면 처음으로). glow면 번짐 띠 (위아래 1px 더) */
function ledCanvas(glow: boolean, text = LED_TEXT): HTMLCanvasElement {
  const { cells, width: loop } = ledLayout(text);
  const W = loop * 2 + LED_BOX.w;
  const H = LED_BOX.h;
  const g = new Grid(W, H);
  const on = new Set<number>();
  for (let rep = 0; rep * loop < W; rep++)
    for (const c of cells) {
      const gl = GLYPHS[c.ch] ?? GLYPHS[" "];
      gl.forEach((row, j) =>
        [...row].forEach((v, i) => {
          const x = rep * loop + c.x + i;
          if (v === "1" && x < W) on.add((j + 1) * W + x);
        }),
      );
    }
  for (const k of on) {
    const x = k % W;
    const y = Math.floor(k / W);
    const star = cells.some((c) => c.ch === "*" && (x % loop) - c.x >= 0 && (x % loop) - c.x < 5);
    const core: Color = star ? 0xff5a44 : 0xffb04a;
    if (glow) {
      g.set(x, y, lighten(core, 0.35), 255);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) if (!on.has((y + dy) * W + x + dx) && !g.filled(x + dx, y + dy)) g.set(x + dx, y + dy, core, 90);
    } else g.set(x, y, core);
  }
  return g.toCanvas();
}

function add(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): void {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
}

/** 11/20 전광판 글 바꾸기: 글마다 띠 텍스처 한 쌍 (같은 글이면 다시 굽지 않는다) → 키·한 바퀴 폭 */
export function ledTextures(scene: Phaser.Scene, text: string): { led: string; glow: string; loop: number } {
  if (text === LED_TEXT) return { led: LTEX.led, glow: LTEX.ledGlow, loop: LED_LOOP };
  let h = 0;
  for (const ch of text) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const id = `${LTEX.led}-${(h >>> 0).toString(36)}`;
  add(scene, id, () => ledCanvas(false, text));
  add(scene, `${id}-g`, () => ledCanvas(true, text));
  return { led: id, glow: `${id}-g`, loop: ledLoop(text) };
}

export function ensureLighthouseTextures(scene: Phaser.Scene): void {
  add(scene, LTEX.body, bodyCanvas);
  add(scene, LTEX.glow, glowCanvas);
  add(scene, LTEX.board, boardCanvas);
  add(scene, LTEX.led, () => ledCanvas(false));
  add(scene, LTEX.ledGlow, () => ledCanvas(true));
}

/** 등실 가운데 (그림 왼쪽 위 기준) — 등불 빛무리 자리 */
export const LAMP_AT = { x: Math.round((LIGHTHOUSE_ART_W - 1) / 2), y: TOP - 14 } as const;
