import type * as Phaser from "phaser";
import { darken, Grid, lighten } from "../../sprites/pixel";

// 동물원 그림 (코드로 그리는 픽셀아트): 나무 울타리·정문 아치·사육사·분양 노점·우리 장식(쉼터·건초·여물통·개집·바위 굴·횃대·연못·팻말).
// 처음 쓸 때 장면 텍스처에 한 번 올린다 (ensureZooTextures). 받침(발 위치)이 그림 맨 아래 줄 가운데다.

export const ZTEX = {
  fenceH: "zoo-fence-h",
  fenceV: "zoo-fence-v",
  post: "zoo-post",
  arch: "zoo-arch",
  keeper: (f: number) => `zoo-keeper-${f}`,
  stall: "zoo-stall",
  trough: "zoo-trough",
  hay: "zoo-hay",
  shed: "zoo-shed",
  doghouse: "zoo-doghouse",
  den: "zoo-den",
  perch: "zoo-perch",
  pond: "zoo-pond",
  sign: "zoo-sign",
  ripple: "zoo-ripple",
} as const;

/** 가로 울타리 한 칸 폭 */
export const ZOO_FENCE_W = 16;
export const ZOO_ARCH_TEX_H = 40;

const OUT = 0x1e140c;
const WOOD = 0x9a6a3a;
const WOOD_HI = 0xc08a52;
const WOOD_LO = 0x6a4424;

/** 가로 울타리 한 칸 (16×10): 가로대 두 줄 + 가운데 말뚝 */
function fenceH(): HTMLCanvasElement {
  const g = new Grid(16, 10);
  g.hline(0, 15, 3, WOOD_HI);
  g.hline(0, 15, 4, WOOD);
  g.hline(0, 15, 7, WOOD);
  g.hline(0, 15, 8, WOOD_LO);
  g.rect(7, 1, 2, 9, WOOD);
  g.set(7, 1, WOOD_HI);
  g.set(8, 9, WOOD_LO);
  return g.toCanvas();
}

/** 세로 울타리 한 칸 (4×10): 말뚝 + 가로대 그림자 */
function fenceV(): HTMLCanvasElement {
  const g = new Grid(4, 10);
  g.rect(1, 0, 2, 10, WOOD);
  g.vline(1, 0, 9, WOOD_HI);
  g.set(2, 9, WOOD_LO);
  return g.toCanvas();
}

/** 모서리 말뚝 (4×12, 둥근 머리) */
function post(): HTMLCanvasElement {
  const g = new Grid(4, 12);
  g.rect(0, 2, 4, 10, WOOD);
  g.rect(1, 1, 2, 1, WOOD_HI);
  g.vline(0, 2, 11, WOOD_HI);
  g.vline(3, 2, 11, WOOD_LO);
  return g.toCanvas();
}

/** 정문 아치 (48×40): 통나무 기둥 둘 + 둥근 현판 ("동물원" 글씨는 이름표로) + 기둥 꼭대기 등, 발바닥 동물 그림 */
function arch(): HTMLCanvasElement {
  const g = new Grid(48, 40);
  for (const x of [2, 40]) {
    g.rect(x, 10, 6, 30, WOOD);
    g.vline(x, 10, 39, WOOD_HI);
    g.vline(x + 5, 10, 39, WOOD_LO);
    for (let y = 14; y < 38; y += 6) g.hline(x + 1, x + 4, y, WOOD_LO);
    // 기둥 꼭대기 등
    g.rect(x + 1, 6, 4, 4, 0xffd070);
    g.hline(x, x + 5, 5, WOOD_LO);
  }
  // 가로 들보 + 현판
  g.rect(0, 10, 48, 4, WOOD_LO);
  g.hline(0, 47, 10, WOOD);
  g.rect(9, 0, 30, 11, 0xe8d8b0);
  g.rect(9, 0, 30, 1, 0xf6ecd0);
  g.rect(9, 10, 30, 1, 0xb8a078);
  // 현판 양끝 발바닥
  for (const cx of [12, 35]) {
    g.ellipse(cx, 6, 1.6, 1.4, 0x8a5a32);
    g.set(cx - 2, 3, 0x8a5a32);
    g.set(cx, 2, 0x8a5a32);
    g.set(cx + 2, 3, 0x8a5a32);
  }
  g.outline(OUT, false, 230);
  return g.toCanvas();
}

/** 사육사 (24×28): 사파리 모자·초록 멜빵 작업복·목에 호루라기, 손에 먹이 양동이. 유령 몸 (어부·수집가와 같은 계열) */
function keeper(frame: number): HTMLCanvasElement {
  const g = new Grid(24, 28);
  const ox = 4;
  const oy = 9;
  const body = 0xf0ece0;
  g.ellipse(ox + 8, oy + 8, 6, 6.2, body);
  g.rect(ox + 2, oy + 8, 13, 9, body);
  for (let x = 2; x <= 14; x++) if ((x + frame) % 3 !== 0) g.set(ox + x, oy + 17, body);
  g.recolor((x, y) => x >= ox + 11 && y > oy + 6, darken(body, 0.15));
  // 눈 (반달 웃음)
  for (const ex of [6, 10]) {
    g.set(ox + ex - 1, oy + 8, 0x1a1620);
    g.set(ox + ex, oy + 7, 0x1a1620);
    g.set(ox + ex + 1, oy + 8, 0x1a1620);
  }
  g.set(ox + 4, oy + 10, 0xf0a0a0);
  g.set(ox + 12, oy + 10, 0xf0a0a0);
  // 초록 멜빵 작업복 + 주머니
  const suit = 0x4a7a3a;
  g.rect(ox + 3, oy + 12, 11, 5, suit);
  g.vline(ox + 5, oy + 9, oy + 12, suit);
  g.vline(ox + 11, oy + 9, oy + 12, suit);
  g.rect(ox + 7, oy + 13, 3, 2, darken(suit, 0.25));
  // 호루라기
  g.set(ox + 8, oy + 11, 0xd8d8e0);
  // 사파리 모자 (넓은 챙, 갈색 띠)
  const hat = 0xd8c08a;
  g.ellipse(ox + 8, oy + 1, 5.5, 3.2, hat);
  g.hline(ox, ox + 16, oy + 3, darken(hat, 0.12));
  g.hline(ox + 4, ox + 12, oy + 2, 0x8a5a32);
  g.recolor((x, y) => y <= oy && x >= ox + 10, lighten(hat, 0.18));
  // 먹이 양동이 (오른손, 살짝 흔들)
  const bx = ox + 15;
  const by = oy + 12 + (frame ? 1 : 0);
  g.rect(bx, by, 4, 4, 0x8aa0b8);
  g.hline(bx, bx + 3, by, 0xc8d8e8);
  g.set(bx + 1, by - 1, 0xe8c24a);
  g.set(bx + 2, by - 1, 0x7ac84a);
  g.outline(OUT);
  return g.toCanvas();
}

/** 분양 노점 (32×30): 줄무늬 차양·나무 계산대·펫 바구니·"분양" 팻말 */
function stall(): HTMLCanvasElement {
  const g = new Grid(32, 30);
  // 기둥
  g.vline(2, 8, 29, WOOD_LO);
  g.vline(29, 8, 29, WOOD_LO);
  // 차양 (초록·흰 줄무늬, 아래 물결)
  for (let x = 0; x < 32; x++) {
    const c = Math.floor(x / 4) % 2 ? 0xf2ecdc : 0x5a9a4a;
    g.vline(x, 2, 8, c);
    if (x % 4 !== 3) g.set(x, 9, c);
  }
  g.hline(0, 31, 1, 0x3a6a2a);
  // 계산대
  g.rect(1, 18, 30, 11, WOOD);
  g.hline(1, 30, 18, WOOD_HI);
  g.hline(1, 30, 23, WOOD_LO);
  // 바구니 속 털뭉치 (펫 손님)
  g.rect(5, 14, 8, 4, 0xc8a060);
  g.ellipse(9, 13.5, 3, 2, 0xe8d8c0);
  g.set(7, 12, 0xe8d8c0);
  g.set(11, 12, 0xe8d8c0);
  g.set(8, 13, 0x2a2018);
  g.set(10, 13, 0x2a2018);
  // 먹이 봉투
  g.rect(19, 13, 5, 5, 0xe0b050);
  g.hline(19, 23, 13, 0xb08a30);
  // 팻말 (발바닥)
  g.rect(24, 12, 6, 6, 0xf6ecd0);
  g.ellipse(27, 15.6, 1.3, 1.1, 0x8a5a32);
  g.set(25, 13, 0x8a5a32);
  g.set(27, 13, 0x8a5a32);
  g.set(29, 13, 0x8a5a32);
  g.outline(OUT, false, 230);
  return g.toCanvas();
}

function trough(): HTMLCanvasElement {
  const g = new Grid(16, 8);
  g.rect(1, 2, 14, 5, WOOD);
  g.hline(1, 14, 2, WOOD_HI);
  g.rect(2, 3, 12, 2, 0x8aba5a); // 풀·먹이
  g.set(4, 2, 0xb8e07a);
  g.set(9, 2, 0xe8c24a);
  g.vline(2, 7, 7, WOOD_LO);
  g.vline(13, 7, 7, WOOD_LO);
  g.outline(OUT, false, 210);
  return g.toCanvas();
}

function hay(): HTMLCanvasElement {
  const g = new Grid(14, 10);
  g.rect(1, 2, 12, 7, 0xe0c060);
  g.hline(1, 12, 2, 0xf0d880);
  g.vline(4, 2, 8, 0xb89a3a);
  g.vline(9, 2, 8, 0xb89a3a);
  g.set(2, 1, 0xf0d880);
  g.set(11, 1, 0xf0d880);
  g.outline(OUT, false, 210);
  return g.toCanvas();
}

/** 지붕 있는 쉼터 (28×24) */
function shed(): HTMLCanvasElement {
  const g = new Grid(28, 24);
  g.rect(3, 10, 22, 14, WOOD);
  for (let y = 12; y < 24; y += 3) g.hline(3, 24, y, WOOD_LO);
  g.rect(9, 14, 10, 10, 0x2a1a10); // 어두운 안쪽
  // 지붕 (빨강 기와)
  for (let y = 0; y < 10; y++) g.hline(13 - y - 1, 14 + y + 1, y + 1, y % 3 === 2 ? 0x8a3a2a : 0xb84a3a);
  g.outline(OUT, false, 220);
  return g.toCanvas();
}

/** 개집 (22×20, 뼈다귀 팻말) */
function doghouse(): HTMLCanvasElement {
  const g = new Grid(22, 20);
  g.rect(3, 8, 16, 12, 0xd86a3a);
  for (let y = 10; y < 20; y += 3) g.hline(3, 18, y, 0xb04a2a);
  g.ellipse(11, 16, 3.6, 4, 0x2a1a10);
  g.rect(8, 16, 7, 4, 0x2a1a10);
  for (let y = 0; y < 8; y++) g.hline(10 - y - 1, 11 + y + 1, y + 1, 0x6a4a8a);
  g.hline(9, 13, 5, 0xf6ecd0);
  g.set(8, 4, 0xf6ecd0);
  g.set(8, 6, 0xf6ecd0);
  g.set(14, 4, 0xf6ecd0);
  g.set(14, 6, 0xf6ecd0);
  g.outline(OUT, false, 220);
  return g.toCanvas();
}

/** 바위 굴 (26×16) */
function den(): HTMLCanvasElement {
  const g = new Grid(26, 16);
  g.ellipse(13, 10, 12, 6, 0x7a7468);
  g.ellipse(8, 7, 6, 5, 0x8a8478);
  g.ellipse(18, 8, 6, 5, 0x6a6458);
  g.ellipse(13, 13, 4, 3.2, 0x1a1410);
  g.rect(9, 13, 9, 3, 0x1a1410);
  g.set(6, 4, 0xa8a294);
  g.set(17, 5, 0x8a8478);
  g.set(3, 12, 0x5a8a3a);
  g.set(22, 13, 0x5a8a3a);
  g.outline(OUT, false, 210);
  return g.toCanvas();
}

/** 새 횃대 (12×18) */
function perch(): HTMLCanvasElement {
  const g = new Grid(12, 18);
  g.vline(6, 4, 17, WOOD);
  g.hline(1, 11, 4, WOOD);
  g.hline(2, 10, 9, WOOD_LO);
  g.rect(4, 15, 5, 3, WOOD_LO);
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

/** 연못 (52×28, 바닥에 깐다) */
function pond(): HTMLCanvasElement {
  const g = new Grid(52, 28);
  g.ellipse(26, 14, 25, 13, 0x8a8478);
  g.ellipse(26, 14, 23, 11.5, 0x3d6878);
  g.ellipse(26, 13, 21, 9.5, 0x4a7a8c);
  g.hline(16, 22, 9, 0x8ab8c8);
  g.hline(30, 34, 17, 0x6a9aac);
  g.set(9, 6, 0x5a8a3a);
  g.set(44, 20, 0x5a8a3a);
  g.set(8, 7, 0x7ab84a);
  return g.toCanvas();
}

/** 우리 이름 팻말 (12×14) */
function sign(): HTMLCanvasElement {
  const g = new Grid(12, 14);
  g.vline(6, 7, 13, WOOD_LO);
  g.rect(1, 1, 10, 6, 0xe8d8b0);
  g.hline(1, 10, 1, 0xf6ecd0);
  g.ellipse(6, 4.4, 1.4, 1.2, 0x8a5a32);
  g.set(4, 2, 0x8a5a32);
  g.set(8, 2, 0x8a5a32);
  g.outline(OUT, false, 220);
  return g.toCanvas();
}

/** 물 위 거위 둘레 물결 (16×5) */
function ripple(): HTMLCanvasElement {
  const g = new Grid(16, 5);
  g.ellipse(8, 2.5, 7.5, 2.4, 0xc8ecfa, 160);
  g.ellipse(8, 2.5, 5.5, 1.4, 0x000000, 0);
  return g.toCanvas();
}

export function ensureZooTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(ZTEX.arch)) return;
  tx.addCanvas(ZTEX.fenceH, fenceH());
  tx.addCanvas(ZTEX.fenceV, fenceV());
  tx.addCanvas(ZTEX.post, post());
  tx.addCanvas(ZTEX.arch, arch());
  for (let f = 0; f < 2; f++) tx.addCanvas(ZTEX.keeper(f), keeper(f));
  tx.addCanvas(ZTEX.stall, stall());
  tx.addCanvas(ZTEX.trough, trough());
  tx.addCanvas(ZTEX.hay, hay());
  tx.addCanvas(ZTEX.shed, shed());
  tx.addCanvas(ZTEX.doghouse, doghouse());
  tx.addCanvas(ZTEX.den, den());
  tx.addCanvas(ZTEX.perch, perch());
  tx.addCanvas(ZTEX.pond, pond());
  tx.addCanvas(ZTEX.sign, sign());
  tx.addCanvas(ZTEX.ripple, ripple());
}

const portraits = new Map<number, string>();
/** 사육사 얼굴 그림 dataURL (분양 창, 2배). 브라우저에서만 */
export function keeperPortraitUrl(scale = 2): string {
  const hit = portraits.get(scale);
  if (hit) return hit;
  const src = keeper(0);
  const out = document.createElement("canvas");
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  portraits.set(scale, url);
  return url;
}
