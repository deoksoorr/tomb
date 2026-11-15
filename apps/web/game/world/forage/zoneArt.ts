import type * as Phaser from "phaser";
import { darken, Grid, lighten } from "../../sprites/pixel";
import { FISH_ARCH_H, FISH_ARCH_W, TANK_H, TANK_W, TANK_WATER, WHARF_BOARD_H, WHARF_BOARD_W, type FishDecorKind } from "../fishZone";

// 낚시터 그림 (코드로 그리는 픽셀아트): 입구 아치, 그물 말리는 대, 통발 더미, 물고기 상자, 물통, 등불 기둥,
// 낚시 자리 표시(나무 낚시 의자 + 물결 고리 + 손짓 표시). 발 위치 = 그림 맨 아래 줄 가운데.

export const ZTEX = {
  decor: (k: FishDecorKind) => `fishzone-${k}`,
  stool: "fishzone-stool",
  ripple: (f: number) => `fishzone-ripple-${f}`,
  hook: "fishzone-hook",
  bubble: "fishzone-bubble",
} as const;

const OUT = 0x16121a;
const WOOD = 0x8a5e36;
const WOOD_DARK = 0x5e3e22;
const ROPE = 0xc8b48a;
const LAMP = 0xffd27a;

/** 입구 아치: 통나무 기둥 둘 + 가로대 + 현판(물고기 그림) + 기둥에 매단 등. 44×40 */
function arch(): HTMLCanvasElement {
  const W = FISH_ARCH_W;
  const H = FISH_ARCH_H;
  const g = new Grid(W, H);
  // 기둥
  for (const x0 of [1, W - 6]) {
    g.rect(x0, 8, 5, H - 9, WOOD);
    g.vline(x0, 8, H - 2, lighten(WOOD, 0.15));
    g.vline(x0 + 4, 8, H - 2, WOOD_DARK);
    for (let y = 12; y < H - 2; y += 7) g.hline(x0 + 1, x0 + 3, y, WOOD_DARK);
  }
  // 가로대 두 줄 (위는 양끝이 살짝 솟는다)
  g.rect(0, 6, W, 3, WOOD);
  g.hline(0, W - 1, 6, lighten(WOOD, 0.18));
  g.set(0, 5, WOOD);
  g.set(W - 1, 5, WOOD);
  g.rect(2, 12, W - 4, 2, WOOD_DARK);
  // 현판 (가운데 매단 판자) — 글씨는 이름표(비트맵 글꼴)로 위에 얹는다
  g.rect(9, 0, W - 18, 6, 0xd8c08a);
  g.hline(9, W - 10, 0, 0xeedcae);
  g.hline(9, W - 10, 5, 0xa88a58);
  // 현판 아래 물고기 장식 (매달린 나무 물고기)
  const fx = W / 2;
  g.vline(fx, 9, 15, ROPE);
  g.ellipse(fx, 18, 4, 2, 0x6aa0c0);
  g.set(fx - 5, 17, 0x6aa0c0);
  g.set(fx - 5, 19, 0x6aa0c0);
  g.set(fx + 2, 17, 0x101014);
  g.recolor((x, y) => y >= 19 && Math.abs(x - fx) <= 4 && g.filled(x, y), 0x4a7a98);
  // 기둥에 매단 등 (밤 빛 = FISH_ZONE_LIGHTS)
  for (const lx of [3, W - 4]) {
    g.vline(lx, 9, 11, ROPE);
    g.rect(lx - 1, 12, 3, 4, LAMP);
    g.set(lx, 12, 0xfff2c0);
    g.hline(lx - 1, lx + 1, 16, 0x5a4a3a);
  }
  // 덩굴 (가을 잎)
  for (const [x, y, c] of [[4, 7, 0xc86a2a], [6, 9, 0xe0a040], [W - 7, 8, 0xc86a2a], [W - 5, 10, 0xe0a040], [12, 7, 0xb84a2a]] as const) g.set(x, y, c);
  g.outline(OUT);
  return g.toCanvas();
}

/** 그물 말리는 대: 장대 둘에 걸친 그물 + 매달린 찌. 26×22 */
function netRack(): HTMLCanvasElement {
  const g = new Grid(26, 22);
  for (const x of [2, 23]) g.rect(x - 1, 2, 2, 19, WOOD);
  g.hline(1, 24, 3, WOOD_DARK);
  // 그물 (격자, 아래로 처진다)
  const net = 0x9aa89a;
  for (let x = 3; x <= 22; x++) {
    const sag = Math.round(Math.sin(((x - 3) / 19) * Math.PI) * 4);
    for (let y = 4; y <= 12 + sag; y++) if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) g.set(x, y, net);
    g.set(x, 12 + sag, darken(net, 0.2));
  }
  // 걸린 찌 둘·작은 물고기 하나
  g.set(8, 15, 0xe03a2a);
  g.set(8, 16, 0xf4f4ee);
  g.set(17, 16, 0xe03a2a);
  g.set(17, 17, 0xf4f4ee);
  g.ellipse(13, 15, 2, 1, 0xb0c0c8);
  g.outline(OUT, false, 210);
  return g.toCanvas();
}

/** 통발 더미: 대나무 통발 둘 + 감긴 밧줄. 18×12 */
function traps(): HTMLCanvasElement {
  const g = new Grid(18, 12);
  const cane = 0xb8944a;
  for (const [cx, cy] of [[5, 7], [12, 6]] as const) {
    g.ellipse(cx, cy, 4.5, 3.5, cane);
    for (let x = cx - 4; x <= cx + 4; x += 2) g.vline(x, cy - 3, cy + 3, darken(cane, 0.25));
    g.set(cx - 4, cy, 0x2a2018);
    g.set(cx - 4, cy - 1, 0x2a2018);
  }
  // 밧줄 뭉치
  g.ellipse(14, 9.5, 3, 1.8, ROPE);
  g.set(14, 9, darken(ROPE, 0.25));
  g.outline(OUT, false, 210);
  return g.toCanvas();
}

/** 물고기 상자 (두 단): 얼음·생선 꼬리가 삐죽. 18×16 */
function crates(): HTMLCanvasElement {
  const g = new Grid(18, 16);
  const box = (x: number, y: number, w: number, h: number) => {
    g.rect(x, y, w, h, WOOD);
    g.hline(x, x + w - 1, y, lighten(WOOD, 0.18));
    g.hline(x, x + w - 1, y + Math.floor(h / 2), WOOD_DARK);
    g.vline(x + w - 1, y, y + h - 1, WOOD_DARK);
  };
  box(1, 9, 16, 6);
  box(3, 4, 12, 5);
  g.hline(4, 13, 4, 0xd8eef8);
  for (const [x, c] of [[5, 0x8aa0b0], [9, 0xc0905a], [12, 0x7a9a6a]] as const) {
    g.set(x, 3, c);
    g.set(x + 1, 2, c);
    g.set(x - 1, 2, c);
  }
  g.set(15, 8, 0xd8eef8);
  g.outline(OUT);
  return g.toCanvas();
}

/** 물통: 쇠테 두른 나무통 + 물. 12×13 */
function barrel(): HTMLCanvasElement {
  const g = new Grid(12, 13);
  g.rect(1, 2, 10, 10, WOOD);
  g.ellipse(6, 2.5, 5, 1.6, 0x3d6878);
  g.set(4, 2, 0x8ac0d8);
  for (const y of [5, 9]) g.hline(1, 10, y, 0x5a5a64);
  g.vline(1, 2, 11, lighten(WOOD, 0.15));
  g.vline(10, 2, 11, WOOD_DARK);
  g.outline(OUT);
  return g.toCanvas();
}

/** 등불 기둥: 말뚝 + 갈고리에 매단 등. 10×22 */
function lanternPost(): HTMLCanvasElement {
  const g = new Grid(10, 22);
  g.rect(2, 3, 3, 18, WOOD);
  g.vline(2, 3, 20, lighten(WOOD, 0.15));
  g.hline(3, 7, 3, WOOD_DARK);
  g.vline(7, 4, 5, 0x5a5a64);
  g.rect(6, 6, 3, 4, LAMP);
  g.set(7, 6, 0xfff2c0);
  g.hline(6, 8, 10, 0x5a4a3a);
  g.outline(OUT);
  return g.toCanvas();
}

/** 낚시 의자: 낮은 나무 의자 + 미끼 통. 앉으면 사람에 가려진다. 12×8 */
function stool(): HTMLCanvasElement {
  const g = new Grid(12, 8);
  g.rect(1, 2, 8, 2, 0xb07a44);
  g.hline(1, 8, 2, 0xd09a5a);
  g.vline(2, 4, 6, WOOD_DARK);
  g.vline(7, 4, 6, WOOD_DARK);
  // 미끼 통 (파란 양동이)
  g.rect(9, 3, 3, 4, 0x4a7aa8);
  g.hline(9, 11, 3, 0x7aaad8);
  g.outline(OUT, false, 220);
  return g.toCanvas();
}

/** 물결 고리 (2프레임: 작은 고리·큰 고리). 13×5 */
function ripple(f: number): HTMLCanvasElement {
  const g = new Grid(13, 5);
  const c = 0xd8f0ff;
  if (f === 0) {
    g.hline(4, 8, 1, c);
    g.hline(4, 8, 3, c);
    g.set(3, 2, c);
    g.set(9, 2, c);
  } else {
    g.hline(3, 9, 0, c);
    g.hline(3, 9, 4, c);
    g.set(1, 1, c);
    g.set(11, 1, c);
    g.set(1, 3, c);
    g.set(11, 3, c);
    g.set(0, 2, c);
    g.set(12, 2, c);
  }
  return g.toCanvas();
}

/** 가까이 오면 의자 위에 뜨는 표시: 말풍선 안 낚싯바늘. 9×11 */
function hook(): HTMLCanvasElement {
  const g = new Grid(9, 11);
  g.rect(0, 0, 9, 9, 0xfff6d8);
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) g.set(x, y, 0, 0); // 둥근 모서리 (투명)
  g.set(4, 9, 0xfff6d8);
  // 바늘
  const m = 0x2a5a7a;
  g.vline(5, 1, 6, m);
  g.hline(3, 4, 7, m);
  g.vline(2, 5, 6, m);
  g.set(2, 4, 0xe03a2a);
  g.set(5, 1, 0x6a6a74);
  g.outline(OUT);
  return g.toCanvas();
}

// ── 11/15 납품 부두 위 마당 ──

/** 의뢰 게시판: 지붕 얹은 큰 나무 판 + 쪽지 여러 장(핀) + 꼭대기 작은 등. 글씨 "의뢰 게시판"은 이름표로 위에 얹는다. 56×48 */
function questBoard(): HTMLCanvasElement {
  const W = WHARF_BOARD_W;
  const H = WHARF_BOARD_H;
  const g = new Grid(W, H);
  // 기둥 둘
  for (const x0 of [5, W - 9]) {
    g.rect(x0, 12, 4, H - 13, WOOD_DARK);
    g.vline(x0, 12, H - 2, WOOD);
  }
  // 지붕 (양끝이 살짝 들린 널판)
  g.rect(1, 6, W - 2, 4, 0x6a3a26);
  g.hline(1, W - 2, 6, 0x8a5236);
  g.hline(3, W - 4, 5, 0x8a5236);
  g.set(0, 5, 0x6a3a26);
  g.set(W - 1, 5, 0x6a3a26);
  // 꼭대기 등 (밤 빛 = FISH_ZONE_LIGHTS)
  const cx = W / 2;
  g.rect(cx - 2, 0, 4, 4, LAMP);
  g.set(cx - 1, 1, 0xfff2c0);
  g.hline(cx - 2, cx + 1, 4, 0x4a3a2a);
  // 판 (코르크빛 + 나무 테)
  const bx0 = 3;
  const bx1 = W - 4;
  const by0 = 11;
  const by1 = 36;
  g.rect(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, WOOD);
  g.rect(bx0 + 2, by0 + 2, bx1 - bx0 - 3, by1 - by0 - 3, 0xc89a62);
  for (let y = by0 + 3; y < by1 - 1; y += 3) for (let x = bx0 + 3 + (y % 2); x < bx1 - 1; x += 4) g.set(x, y, 0xb88a54);
  g.hline(bx0, bx1, by0, lighten(WOOD, 0.2));
  g.hline(bx0, bx1, by1, WOOD_DARK);
  // 쪽지 (크림·하늘·연분홍) + 빨간·파란 핀 + 글줄
  const notes: [number, number, number, number, number, number][] = [
    [7, 14, 10, 9, 0xfff6dc, 0xd84a3a],
    [19, 15, 9, 8, 0xd8ecff, 0x3a6ad8],
    [30, 13, 11, 10, 0xfff6dc, 0xd84a3a],
    [43, 15, 8, 9, 0xffe0e8, 0x3aa85a],
    [10, 25, 9, 8, 0xffe0e8, 0x3a6ad8],
    [22, 25, 12, 9, 0xfff6dc, 0xe0a030],
    [37, 26, 9, 7, 0xd8ecff, 0xd84a3a],
  ];
  for (const [x, y, w, h, c, pin] of notes) {
    g.rect(x, y, w, h, c);
    g.hline(x, x + w - 1, y + h - 1, darken(c, 0.12));
    for (let ly = y + 3; ly < y + h - 1; ly += 2) g.hline(x + 1, x + w - 3, ly, darken(c, 0.32));
    g.set(x + (w >> 1), y, pin);
  }
  // 다리 사이 가로대
  g.rect(7, 40, W - 14, 2, WOOD_DARK);
  g.outline(OUT);
  for (let x = 6; x < W - 6; x++) g.set(x, H - 1, 0x000000, 60);
  return g.toCanvas();
}

/** 긴급 의뢰 현판 자리: 빈 종이를 끼운 작은 나무 틀 (나중에 진행 막대를 그릴 자리). 24×30 */
function placard(): HTMLCanvasElement {
  const g = new Grid(24, 30);
  g.rect(10, 18, 4, 11, WOOD_DARK);
  g.vline(10, 18, 28, WOOD);
  g.rect(1, 2, 22, 17, WOOD);
  g.hline(1, 22, 2, lighten(WOOD, 0.2));
  g.rect(3, 4, 18, 13, 0xf4ead2);
  g.hline(3, 20, 16, 0xd8ccb0);
  // 위쪽 빨간 띠 (긴급 표시 자리) — 지금은 바랜 색
  g.rect(3, 4, 18, 2, 0xc8a090);
  g.outline(OUT);
  for (let x = 7; x < 17; x++) g.set(x, 29, 0x000000, 60);
  return g.toCanvas();
}

/** 기록 수족관 수조: 나무 받침 + 유리 상자(푸른 물·모래·수초·공기 방울). 물고기는 FishZoneView가 따로 그린다. 32×30 */
function tank(): HTMLCanvasElement {
  const W = TANK_W;
  const H = TANK_H;
  const g = new Grid(W, H);
  const wx0 = TANK_WATER.x;
  const wy0 = TANK_WATER.y;
  const wx1 = wx0 + TANK_WATER.w - 1;
  const wy1 = wy0 + TANK_WATER.h - 1;
  // 받침 (나무 서랍장)
  g.rect(1, wy1 + 3, W - 2, H - wy1 - 4, WOOD);
  g.hline(1, W - 2, wy1 + 3, lighten(WOOD, 0.2));
  g.hline(4, W - 5, wy1 + 6, WOOD_DARK);
  g.set(W >> 1, wy1 + 5, 0xd8c08a);
  // 유리 테 (윗뚜껑·모서리 기둥)
  g.rect(wx0 - 2, wy0 - 3, TANK_WATER.w + 4, 2, 0x3a4a52);
  g.vline(wx0 - 2, wy0 - 1, wy1 + 2, 0x5a6a72);
  g.vline(wx1 + 2, wy0 - 1, wy1 + 2, 0x5a6a72);
  g.hline(wx0 - 2, wx1 + 2, wy1 + 2, 0x3a4a52);
  // 물 (위가 밝고 아래가 짙은 푸른빛, 반투명)
  for (let y = wy0 - 1; y <= wy1 + 1; y++) {
    const t = (y - wy0) / TANK_WATER.h;
    g.hline(wx0 - 1, wx1 + 1, y, t < 0.15 ? 0x9fd8f0 : t < 0.6 ? 0x5fa8d0 : 0x3f80b0);
  }
  for (let x = wx0 - 1; x <= wx1 + 1; x++) g.set(x, wy0 - 1, 0xd8f4ff);
  // 모래·조약돌·수초
  for (let x = wx0 - 1; x <= wx1 + 1; x++) g.set(x, wy1 + 1, (x * 7) % 5 === 0 ? 0xc8b078 : 0xe0cc94);
  g.set(wx0 + 4, wy1, 0x9a9a92);
  g.set(wx1 - 6, wy1, 0xb8a888);
  for (const [x, h] of [[wx0 + 2, 7], [wx0 + 3, 5], [wx1 - 2, 8], [wx1 - 3, 5]] as const)
    for (let k = 0; k < h; k++) g.set(x + (k % 3 === 1 ? 1 : 0), wy1 - k, k % 2 ? 0x3a9a5a : 0x5aba6a);
  // 유리 반사
  g.vline(wx0 + 1, wy0 + 1, wy0 + 5, 0xe8f8ff);
  g.vline(wx0 + 2, wy0 + 1, wy0 + 2, 0xe8f8ff);
  g.outline(OUT);
  for (let x = 3; x < W - 3; x++) g.set(x, H - 1, 0x000000, 60);
  return g.toCanvas();
}

/** 수조 공기 방울 (작은 흰 동그라미). 3×3 */
function bubble(): HTMLCanvasElement {
  const g = new Grid(3, 3);
  g.set(1, 0, 0xe8f8ff);
  g.set(0, 1, 0xe8f8ff);
  g.set(2, 1, 0xe8f8ff);
  g.set(1, 2, 0xe8f8ff);
  return g.toCanvas();
}

const DECOR_ART: Record<FishDecorKind, () => HTMLCanvasElement> = { arch, netRack, traps, crates, barrel, lanternPost, questBoard, placard, tank };

export function ensureZoneTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(ZTEX.stool)) return;
  for (const k of Object.keys(DECOR_ART) as FishDecorKind[]) tx.addCanvas(ZTEX.decor(k), DECOR_ART[k]());
  tx.addCanvas(ZTEX.stool, stool());
  tx.addCanvas(ZTEX.ripple(0), ripple(0));
  tx.addCanvas(ZTEX.ripple(1), ripple(1));
  tx.addCanvas(ZTEX.hook, hook());
  tx.addCanvas(ZTEX.bubble, bubble());
}
