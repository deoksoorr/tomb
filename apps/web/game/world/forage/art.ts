import type * as Phaser from "phaser";
import { forageIconCanvas } from "../../sprites/forageIcons";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";

// 4·32번 낚시·채집 월드 그림 (코드로 그리는 픽셀아트): NPC 둘(어부 영감·수집가 유령)과 노점, 채집 지점 4종, 찌, 느낌표.
// 처음 쓸 때 장면 텍스처에 한 번 올린다 (ensureForageTextures). 발 위치가 그림 맨 아래 줄 가운데다.

export const FTEX = {
  npc: (id: string, f: number) => `forage-npc-${id}-${f}`,
  stall: (id: string) => `forage-stall-${id}`,
  node: (kind: string, f: number) => `forage-node-${kind}-${f}`,
  bobber: "forage-bobber",
  bang: "forage-bang",
  icon: (id: string) => `forage-icon-${id}`,
} as const;

const OUT = 0x16121a;

/** 유령 몸 (두건 없는 흰 천): 아래 물결 자락, 눈 두 개 */
function ghostBody(g: Grid, ox: number, oy: number, body: Color, frame: number): void {
  const shade = darken(body, 0.18);
  g.ellipse(ox + 8, oy + 8, 6, 6.2, body);
  g.rect(ox + 2, oy + 8, 13, 9, body);
  // 물결 자락 (프레임마다 살짝 다르게)
  for (let x = 2; x <= 14; x++) if ((x + frame) % 3 !== 0) g.set(ox + x, oy + 17, body);
  g.recolor((x, y) => x >= ox + 11 && y > oy + 6, shade);
  g.set(ox + 6, oy + 8, 0x1a1620);
  g.set(ox + 10, oy + 8, 0x1a1620);
  g.set(ox + 6, oy + 7, 0x1a1620);
  g.set(ox + 10, oy + 7, 0x1a1620);
}

/** 어부 영감: 노란 우비 모자·회색 수염·멜빵, 손에 생선 한 마리. 24×26 */
function fishmonger(frame: number): HTMLCanvasElement {
  const g = new Grid(24, 26);
  const ox = 4;
  const oy = 7;
  ghostBody(g, ox, oy, 0xe8e4da, frame);
  // 멜빵 바지 (파랑)
  g.rect(ox + 3, oy + 12, 11, 5, 0x3a5a8a);
  g.vline(ox + 5, oy + 8, oy + 12, 0x3a5a8a);
  g.vline(ox + 11, oy + 8, oy + 12, 0x3a5a8a);
  // 수염
  g.ellipse(ox + 8, oy + 11, 3.4, 2, 0xb8b8b0);
  g.set(ox + 8, oy + 10, 0xd8a090);
  // 우비 모자 (사우웨스터): 넓은 챙
  const hat = 0xf0c030;
  g.rect(ox + 3, oy - 2, 11, 5, hat);
  g.hline(ox + 1, ox + 15, oy + 3, darken(hat, 0.15));
  g.hline(ox, ox + 16, oy + 4, darken(hat, 0.15));
  g.recolor((x, y) => y <= oy - 1 && x >= ox + 10, lighten(hat, 0.2));
  // 손에 든 생선 (오른쪽)
  const fx = ox + 15;
  const fy = oy + 11 + (frame ? 1 : 0);
  g.ellipse(fx + 2.5, fy, 2.8, 1.4, 0x8aa0b0);
  g.set(fx + 5, fy - 1, 0x6a8090);
  g.set(fx + 5, fy + 1, 0x6a8090);
  g.set(fx + 1, fy - 1, 0x101014);
  g.outline(OUT);
  return g.toCanvas();
}

/** 수집가 유령: 보라 망토·둥근 안경·커다란 배낭(잡동사니가 삐죽), 허리춤 작은 등불. 24×26 */
function collector(frame: number): HTMLCanvasElement {
  const g = new Grid(24, 26);
  const ox = 5;
  const oy = 7;
  // 배낭 (왼쪽 뒤)
  const pack = 0x8a5a32;
  g.rect(ox - 4, oy + 1, 8, 12, pack);
  g.rect(ox - 4, oy + 1, 8, 2, darken(pack, 0.25));
  g.set(ox - 3, oy - 1, 0x9aa4ae); // 삐죽 나온 국자
  g.vline(ox - 3, oy - 1, oy + 1, 0x9aa4ae);
  g.set(ox, oy - 2, 0xe8c24a); // 두루마리
  g.vline(ox, oy - 2, oy + 1, 0xe8c24a);
  g.set(ox + 2, oy, 0x4ad0c0);
  ghostBody(g, ox, oy, 0xd8d0f0, frame);
  // 망토 (보라)
  g.rect(ox + 2, oy + 11, 13, 6, 0x6a4a9a);
  g.recolor((x, y) => y >= oy + 11 && y <= oy + 16 && x >= ox + 11, 0x5a3a88);
  // 둥근 안경
  for (const cx of [6, 10]) {
    g.set(ox + cx - 1, oy + 7, 0xe8c24a);
    g.set(ox + cx + 1, oy + 7, 0xe8c24a);
    g.set(ox + cx, oy + 6, 0xe8c24a);
    g.set(ox + cx, oy + 9, 0xe8c24a);
  }
  // 작은 등불
  const lx = ox + 15;
  const ly = oy + 12 + (frame ? 1 : 0);
  g.rect(lx, ly, 3, 3, 0xffd060);
  g.set(lx + 1, ly - 1, 0x5a5a64);
  g.outline(OUT);
  return g.toCanvas();
}

/** 생선 노점: 얼음 위 생선이 놓인 나무 상자 + "생선" 팻말. 26×18 */
function fishStall(): HTMLCanvasElement {
  const g = new Grid(26, 18);
  const wood = 0x9a6a3a;
  g.rect(2, 8, 22, 9, wood);
  g.hline(2, 23, 12, darken(wood, 0.25));
  g.rect(3, 5, 20, 4, 0xd8eef8); // 얼음
  for (const [x, c] of [[5, 0x8aa0b0], [11, 0xb08a3a], [17, 0x6a8a4a]] as const) {
    g.ellipse(x + 2.5, 6, 3, 1.4, c);
    g.set(x + 5, 6, darken(c, 0.2));
    g.set(x + 1, 5, 0x101014);
  }
  // 팻말
  g.rect(20, 0, 6, 5, 0xf0e8d0);
  g.vline(22, 5, 8, darken(wood, 0.2));
  g.hline(21, 24, 2, 0xd84a3a);
  g.outline(OUT);
  return g.toCanvas();
}

/** 수집가 좌판: 돗자리 위 병·상자·반짝이. 26×12 */
function collectorMat(): HTMLCanvasElement {
  const g = new Grid(26, 12);
  g.rect(1, 6, 24, 5, 0xb84a4a);
  for (let x = 2; x < 25; x += 3) g.vline(x, 6, 10, 0xd86a5a);
  g.rect(3, 2, 3, 5, 0x6ad0c0); // 병
  g.set(4, 1, 0x9a6a3a);
  g.rect(9, 3, 5, 4, 0x8a5a32); // 상자
  g.hline(9, 13, 3, 0xe8c24a);
  g.ellipse(18, 5, 2, 2, 0xa86ae0); // 수정
  g.set(18, 4, 0xffffff);
  g.rect(21, 4, 3, 3, 0xe8c24a); // 동전 더미
  g.outline(OUT);
  return g.toCanvas();
}

/** 채집 지점 그림 (2프레임: 흔들림·반짝임) */
function nodeArt(kind: string, f: number, night: boolean): HTMLCanvasElement {
  switch (kind) {
    case "herb": {
      const g = new Grid(14, 12);
      const leaf = 0x5aa040;
      const sway = f ? 1 : 0;
      for (const [x, y, rx] of [[4, 8, 2.6], [10, 8, 2.6], [7, 6, 2.2]] as const) g.ellipse(x + (y < 7 ? sway : 0), y, rx, 1.6, y < 7 ? lighten(leaf, 0.15) : leaf);
      g.vline(7 + sway, 3, 9, darken(leaf, 0.3));
      g.set(7 + sway, 2, 0xf0e070);
      g.set(6 + sway, 2, 0xf8f0a0);
      g.ellipse(7, 11, 5, 1, 0x5a4028);
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    case "ore": {
      const g = new Grid(16, 12);
      g.ellipse(8, 7.5, 6.5, 4.2, 0x7a7c84);
      g.rect(3, 5, 4, 3, 0x8a8c94);
      g.recolor((x, y) => y >= 9, 0x5a5c64);
      g.recolor((x, y) => y <= 5 && x <= 8, 0xa0a2aa);
      g.vline(10, 2, 6, 0xa86ae0);
      g.vline(11, 3, 6, 0xc89af0);
      g.set(5, 7, 0x8ad0ff);
      if (f) {
        g.set(11, 2, 0xffffff);
        g.set(5, 6, 0xffffff);
      }
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    case "dig": {
      const g = new Grid(16, 10);
      g.ellipse(8, 7, 6.5, 2.6, 0x7a5232);
      g.recolor((x, y) => y <= 5, 0x9a6a42);
      // X 표시
      for (let i = 0; i < 4; i++) {
        g.set(6 + i, 5 + (i % 2), 0xe8d8b0);
        g.set(9 - i, 5 + (i % 2), 0xe8d8b0);
      }
      // 반짝
      const sx = f ? 12 : 4;
      g.set(sx, 2, 0xfff6c0);
      g.set(sx - 1, 3, 0xffe08a);
      g.set(sx + 1, 3, 0xffe08a);
      g.set(sx, 4, 0xfff6c0);
      g.set(sx, 3, 0xffffff);
      g.outline(OUT, false, 160);
      return g.toCanvas();
    }
    default: {
      // 곤충 수풀: 동그란 덤불 + 낮엔 나비, 밤엔 반딧불
      const g = new Grid(18, 16);
      const leaf = 0x4a8a3a;
      g.ellipse(9, 10, 7.5, 5, leaf);
      g.ellipse(6, 8, 3.5, 3, lighten(leaf, 0.12));
      g.ellipse(12, 8.5, 3.5, 3, lighten(leaf, 0.06));
      g.recolor((x, y) => y >= 12, darken(leaf, 0.25));
      for (const [x, y] of [[4, 11], [9, 9], [13, 12], [7, 13]]) g.set(x, y, 0xe8a0c0);
      g.outline(OUT, false, 200);
      if (night) {
        for (const [x, y] of f ? [[3, 3], [14, 5], [9, 1]] : [[5, 2], [12, 2], [15, 7]]) {
          g.set(x, y, 0xfff080);
          g.set(x + 1, y, 0xffe050, 140);
        }
      } else {
        const bx = f ? 12 : 3;
        const by = f ? 2 : 3;
        g.set(bx, by, 0xf4f4ee);
        g.set(bx + 2, by, 0xf4f4ee);
        g.set(bx + 1, by + 1, 0x2a2420);
        g.set(bx, by + 1, f ? 0xf0d040 : 0xf4f4ee);
        g.set(bx + 2, by + 1, f ? 0xf0d040 : 0xf4f4ee);
      }
      return g.toCanvas();
    }
  }
}

function bobber(): HTMLCanvasElement {
  const g = new Grid(5, 6);
  g.rect(1, 0, 3, 3, 0xe03a2a);
  g.rect(1, 3, 3, 2, 0xf4f4ee);
  g.set(2, 0, 0xff8a7a);
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

function bang(): HTMLCanvasElement {
  const g = new Grid(5, 11);
  g.rect(1, 0, 3, 6, 0xfff4a0);
  g.rect(1, 8, 3, 2, 0xfff4a0);
  g.rect(2, 1, 1, 4, 0xe03a2a);
  g.set(2, 8, 0xe03a2a);
  g.outline(OUT);
  return g.toCanvas();
}

export const NODE_KINDS = ["herb", "ore", "dig", "bug"] as const;

export function ensureForageTextures(scene: Phaser.Scene, night: boolean): void {
  const tx = scene.textures;
  if (!tx.exists(FTEX.bobber)) {
    for (let f = 0; f < 2; f++) {
      tx.addCanvas(FTEX.npc("fishmonger", f), fishmonger(f));
      tx.addCanvas(FTEX.npc("collector", f), collector(f));
    }
    tx.addCanvas(FTEX.stall("fishmonger"), fishStall());
    tx.addCanvas(FTEX.stall("collector"), collectorMat());
    tx.addCanvas(FTEX.bobber, bobber());
    tx.addCanvas(FTEX.bang, bang());
  }
  // 곤충 수풀은 낮/밤 그림이 다르다 → 밤낮이 바뀌면 다시 올린다
  for (const k of NODE_KINDS)
    for (let f = 0; f < 2; f++) {
      const key = FTEX.node(k, f);
      if (k === "bug" && tx.exists(key)) tx.remove(key);
      if (!tx.exists(key)) tx.addCanvas(key, nodeArt(k, f, night));
    }
}

const portraits = new Map<string, string>();
/** NPC 얼굴 그림 dataURL (판매 창, 2배). 브라우저에서만 */
export function npcPortraitUrl(id: "fishmonger" | "collector", scale = 2): string {
  const key = `${id}|${scale}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  const src = id === "fishmonger" ? fishmonger(0) : collector(0);
  const out = document.createElement("canvas");
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  portraits.set(key, url);
  return url;
}

/** 아이템 아이콘을 장면 텍스처로 (잡았을 때 머리 위에 띄운다) */
export function ensureIconTexture(scene: Phaser.Scene, id: string): string | null {
  const key = FTEX.icon(id);
  if (scene.textures.exists(key)) return key;
  const c = forageIconCanvas(id);
  if (!c) return null;
  scene.textures.addCanvas(key, c);
  return key;
}
