import { DEFAULT_FLOOR, DEFAULT_WALL, furnitureById } from "@/lib/housing/catalog";
import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";

// 하우징 물건·바닥·담장 픽셀아트 (캔버스만 쓴다: 게임 텍스처와 UI 아이콘이 같은 그림).
//  - 물건 그림 크기 = (w×16) × (h×16 + up). 아래쪽 h×16이 차지 칸이고, up만큼 위로 솟는다(책장·나무 등).
//  - 돌리면 가로·세로가 바뀌는 물건(turn)은 위에서 내려다본 그림이라 up=0이다 (90° 돌려 그려도 어색하지 않게).

const OUT = 0x1a1612;
const WOOD = 0x7a5236;
const WOOD_D = 0x553722;
const WOOD_L = 0x9c6d45;
const STONE = 0x8c8a82;
const STONE_D = 0x5f5d57;
const LEAF = 0x4f7a4a;
const LEAF_D = 0x34563a;
const LEAF_L = 0x76a466;

/** 솟는 높이 (px) */
const UP: Record<string, number> = {
  chair: 6,
  bookshelf: 14,
  table: 2,
  monitor_desk: 8,
  server_rack: 16,
  whiteboard: 12,
  postit_wall: 12,
  duck_shelf: 12,
  coffee_machine: 6,
  frame_404: 8,
  pot: 4,
  tree: 18,
  bush: 2,
  stone_lantern: 12,
  candles: 6,
  firefly_jar: 4,
  wind_chime: 14,
  memorial: 6,
  ghost_cat: 2,
};

export const artUp = (id: string) => UP[id] ?? 0;

type Draw = (g: Grid, W: number, H: number) => void;

/** 칠한 상자 + 아랫변 그림자 */
const box = (g: Grid, x: number, y: number, w: number, h: number, c: Color, edge = darken(c, 0.35)) => {
  g.rect(x, y, w, h, c);
  g.hline(x, x + w - 1, y + h - 1, edge);
};

const DRAW: Record<string, Draw> = {
  desk: (g, W) => {
    box(g, 1, 2, W - 2, 12, WOOD);
    g.rect(1, 2, W - 2, 2, WOOD_L);
    g.rect(5, 5, 8, 6, 0xe8e0c8); // 기획서
    g.hline(6, 11, 7, 0x9a9488);
    g.hline(6, 10, 9, 0x9a9488);
    g.rect(20, 5, 3, 4, 0xc05a4a); // 머그
  },
  chair: (g, _W, H) => {
    g.rect(3, 0, 10, 8, WOOD); // 등받이
    g.rect(4, 1, 8, 2, WOOD_L);
    box(g, 2, 8, 12, 6, WOOD_L);
    g.vline(3, 14, H - 1, WOOD_D);
    g.vline(12, 14, H - 1, WOOD_D);
  },
  sofa: (g, W) => {
    box(g, 1, 1, W - 2, 14, 0x4e5f84);
    g.rect(1, 1, W - 2, 4, 0x3e4d6c); // 등받이
    g.rect(1, 1, 3, 14, 0x3e4d6c);
    g.rect(W - 4, 1, 3, 14, 0x3e4d6c);
    g.vline(W / 2, 5, 13, 0x3a4866);
    g.rect(6, 6, 6, 4, 0xc8a050); // 쿠션
  },
  bed: (g, W, H) => {
    box(g, 1, 1, W - 2, H - 2, WOOD);
    g.rect(3, 3, W - 6, H - 6, 0xd8d0c0);
    g.rect(5, 4, W - 10, 6, 0xf0ead8); // 베개
    g.rect(3, 13, W - 6, H - 16, 0x6a4a7a); // 이불
    g.hline(3, W - 4, 13, 0x8a6a9a);
  },
  bookshelf: (g, W, H) => {
    box(g, 1, 0, W - 2, H, WOOD_D);
    const colors = [0xa04a3a, 0x3a6a8a, 0xc8a050, 0x4f7a4a, 0x7a4a8a, 0xd8d0c0];
    for (let row = 0; row < 3; row++) {
      const y = 2 + row * 9;
      g.rect(3, y, W - 6, 7, 0x2a1c14);
      for (let x = 3, i = row; x < W - 4; x += 3, i++) g.rect(x, y + (i % 3 === 0 ? 2 : 1), 2, 6 - (i % 3 === 0 ? 1 : 0), colors[i % colors.length]);
    }
  },
  table: (g, W, H) => {
    g.ellipse(W / 2, 7, 7, 5, WOOD_L);
    g.hline(3, 12, 10, WOOD);
    g.rect(7, 11, 2, H - 12, WOOD_D);
    g.rect(6, 4, 4, 3, 0xe8e0c8); // 찻잔
  },
  rug: (g, W, H) => {
    g.rect(1, 1, W - 2, H - 2, 0x6a2e3a);
    g.rect(3, 3, W - 6, H - 6, 0x8a3e4a);
    g.rect(6, 6, W - 12, H - 12, 0xc8a050);
    g.rect(8, 8, W - 16, H - 16, 0x8a3e4a);
    for (let x = 2; x < W - 2; x += 3) {
      g.set(x, 0, 0xd8c890);
      g.set(x, H - 1, 0xd8c890);
    }
  },
  monitor_desk: (g, W, H) => {
    box(g, 1, H - 12, W - 2, 10, WOOD_D);
    for (const x of [4, 17]) {
      g.rect(x, 1, 11, 9, 0x22262e);
      g.rect(x + 1, 2, 9, 6, x === 4 ? 0x3a6ab0 : 0x2a8a5a);
      g.hline(x + 2, x + 6, 4, 0xbfe0ff);
      g.hline(x + 2, x + 8, 6, 0x9fd0b0);
      g.rect(x + 4, 10, 3, 2, 0x22262e);
    }
    g.rect(10, H - 9, 12, 3, 0x30343c); // 키보드
  },
  server_rack: (g, W, H) => {
    box(g, 2, 0, W - 4, H, 0x2a2e36);
    for (let y = 2; y < H - 3; y += 4) {
      g.rect(4, y, W - 8, 3, 0x3c424c);
      g.set(5, y + 1, (y / 4) % 2 ? 0x7fe0a0 : 0xe0c050);
      g.set(7, y + 1, 0x7fe0a0);
    }
  },
  whiteboard: (g, W, H) => {
    g.vline(3, 10, H - 1, STONE_D);
    g.vline(W - 4, 10, H - 1, STONE_D);
    g.rect(1, 1, W - 2, 16, 0xb0b4b8);
    g.rect(2, 2, W - 4, 14, 0xf0f2f0);
    g.hline(5, 10, 5, 0x3a6ab0);
    g.hline(5, 10, 8, 0x3a6ab0);
    g.hline(11, 18, 7, 0xc04a3a);
    g.hline(19, 25, 5, 0x3a6ab0);
    g.hline(19, 25, 9, 0x3a6ab0);
    g.hline(6, 22, 12, 0x404040);
  },
  postit_wall: (g, W, H) => {
    box(g, 1, 1, W - 2, H - 4, 0x6a5440);
    const c = [0xf0e070, 0xf0a0b0, 0x90d0f0, 0xa0e090];
    for (let i = 0; i < 12; i++) {
      const x = 3 + (i % 6) * 5;
      const y = 3 + Math.floor(i / 6) * 7 + (i % 2);
      g.rect(x, y, 4, 4, c[i % 4]);
      g.set(x + 1, y + 1, darken(c[i % 4], 0.4));
    }
  },
  duck_shelf: (g, W, H) => {
    box(g, 1, 0, W - 2, H, WOOD);
    for (const y of [9, 18]) {
      g.hline(1, W - 2, y, WOOD_D);
      for (const x of [3, 9]) {
        g.rect(x, y - 4, 4, 3, 0xf0d040);
        g.set(x + 3, y - 5, 0xf0d040);
        g.set(x + 4, y - 4, 0xe08030);
        g.set(x + 3, y - 4, 0x202020);
      }
    }
  },
  coffee_machine: (g, W, H) => {
    box(g, 3, 1, W - 6, H - 2, 0x30343a);
    g.rect(5, 3, W - 10, 4, 0x50565e);
    g.set(6, 4, 0xe05040);
    g.rect(6, H - 9, 4, 4, 0xe8e0c8);
    g.rect(6, H - 8, 4, 1, 0x5a3a26);
  },
  frame_404: (g, W, H) => {
    g.vline(4, 12, H - 1, WOOD_D);
    g.vline(11, 12, H - 1, WOOD_D);
    g.rect(1, 1, W - 2, 14, WOOD_L);
    g.rect(2, 2, W - 4, 12, 0x1e2230);
    // 4 0 4
    const t = (x: number) => {
      g.vline(x, 5, 7, 0xe0c060);
      g.hline(x, x + 2, 8, 0xe0c060);
      g.vline(x + 2, 5, 10, 0xe0c060);
    };
    t(3);
    g.rect(7, 5, 2, 6, 0xe0c060, 255);
    g.set(7, 6, 0x1e2230);
    g.set(7, 9, 0x1e2230);
    t(10);
  },
  pot: (g, W, H) => {
    g.rect(4, H - 8, 8, 7, 0xa85a3a);
    g.hline(3, 12, H - 8, 0xc8704a);
    g.ellipse(W / 2, 6, 5, 5, LEAF);
    g.set(6, 4, LEAF_L);
    g.set(9, 6, LEAF_L);
  },
  tree: (g, W, H) => {
    g.ellipse(W / 2, H - 4, 10, 3, 0x000000, 70);
    g.rect(W / 2 - 3, H - 18, 6, 15, 0x5a3e2a);
    g.ellipse(W / 2, 16, 14, 14, LEAF_D);
    g.ellipse(W / 2 - 4, 12, 9, 8, LEAF);
    g.ellipse(W / 2 + 6, 18, 7, 6, LEAF);
    for (let i = 0; i < 14; i++) g.set(6 + ((i * 7) % 20), 6 + ((i * 5) % 20), LEAF_L);
  },
  pond: (g, W, H) => {
    g.ellipse(W / 2, H / 2, W / 2 - 1, H / 2 - 1, STONE_D);
    g.ellipse(W / 2, H / 2, W / 2 - 3, H / 2 - 3, 0x24405e);
    g.ellipse(W / 2 + 4, H / 2 - 3, 6, 3, 0x34587a);
    g.ellipse(W / 2 - 8, H / 2 + 2, 3, 2, 0xe8e4c8); // 달
    g.ellipse(10, H - 9, 3, 2, LEAF); // 연잎
    g.set(10, H - 10, 0xf0a0c0);
  },
  flowerbed: (g, W, H) => {
    g.rect(1, 2, W - 2, H - 4, 0x3a2c22);
    const c = [0xf0a0c0, 0xf0e080, 0xb0a0f0, 0xf0f0f0];
    for (let i = 0; i < 18; i++) {
      const x = 2 + ((i * 7) % (W - 4));
      const y = 3 + ((i * 3) % (H - 7));
      g.set(x, y + 1, LEAF);
      g.set(x, y, c[i % 4]);
    }
  },
  stone_path: (g) => {
    g.ellipse(6, 6, 4.5, 3.5, STONE);
    g.ellipse(11, 11, 4, 3, STONE);
    g.set(5, 5, lighten(STONE, 0.3));
    g.set(10, 10, lighten(STONE, 0.3));
    g.outline(STONE_D, false, 200);
  },
  bush: (g, W, H) => {
    g.ellipse(W / 2, H - 7, 7, 6, LEAF_D);
    g.ellipse(W / 2 - 2, H - 9, 4, 3.5, LEAF);
    g.set(5, H - 10, LEAF_L);
    g.set(10, H - 8, LEAF_L);
  },
  mushrooms: (g) => {
    for (const [x, y, r] of [[5, 9, 3], [11, 7, 2.5], [9, 12, 2]] as const) {
      g.vline(x, y, y + 3, 0xe8e0c8);
      g.ellipse(x, y, r, r * 0.7, 0x5ac0a0);
      g.set(x - 1, y - 1, 0xc8fff0);
    }
  },
  stone_lantern: (g, _W, H) => {
    g.rect(4, H - 4, 8, 3, STONE_D);
    g.rect(6, H - 12, 4, 8, STONE);
    g.rect(3, H - 18, 10, 6, STONE);
    g.rect(5, H - 17, 6, 4, 0xffd080);
    g.rect(2, H - 21, 12, 3, STONE_D);
    g.rect(6, H - 24, 4, 3, STONE);
  },
  candles: (g, _W, H) => {
    g.rect(4, H - 3, 8, 2, 0x8a7040);
    g.vline(8, H - 9, H - 3, 0x8a7040);
    g.hline(4, 12, H - 9, 0x8a7040);
    for (const x of [4, 8, 12]) {
      g.rect(x - 1, H - 14, 2, 5, 0xf0e8d8);
      g.set(x, H - 16, 0xffd070);
      g.set(x, H - 15, 0xffa040);
    }
  },
  firefly_jar: (g, _W, H) => {
    g.rect(4, H - 13, 8, 11, 0x6a8a9a, 140);
    g.rect(5, H - 15, 6, 2, 0x8a6a40);
    g.hline(4, 11, H - 2, 0x4a6a7a);
    for (const [x, y] of [[6, 6], [9, 9], [7, 11]]) g.set(x, H - 16 + y, 0xe8ff9a);
  },
  wind_chime: (g, _W, H) => {
    g.vline(3, 0, H - 2, WOOD_D);
    g.hline(3, 11, 1, WOOD_D);
    g.vline(9, 2, 4, 0x909090);
    g.rect(7, 5, 5, 5, 0x6ab0a0);
    g.vline(9, 10, 13, 0xd0d0d0);
    g.rect(8, 14, 3, 4, 0xf0e8d0);
    g.rect(2, H - 2, 3, 2, STONE_D);
  },
  memorial: (g, _W, H) => {
    g.rect(2, H - 4, 12, 3, STONE_D);
    g.rect(4, H - 18, 8, 14, 0x9a988e);
    g.rect(5, H - 20, 6, 2, 0x9a988e);
    g.hline(6, 9, H - 14, 0x5a5850);
    g.hline(6, 9, H - 11, 0x5a5850);
    g.set(3, H - 5, 0xf0a0c0);
    g.set(12, H - 5, 0xf0e080);
  },
  ghost_cat: (g, _W, H) => {
    g.ellipse(8, H - 5, 7, 4, 0x8a3e4a);
    g.ellipse(8, H - 8, 5, 4, 0xd8e0f0, 200);
    g.set(5, H - 12, 0xd8e0f0, 200);
    g.set(10, H - 12, 0xd8e0f0, 200);
    g.hline(6, 7, H - 8, 0x4a5060);
    g.hline(9, 10, H - 8, 0x4a5060);
    g.hline(12, 14, H - 6, 0xd8e0f0);
  },
};

/** 물건 그림 (차지 칸 + 위로 솟는 부분). 없는 id면 null */
export function furnitureGrid(id: string): Grid | null {
  const def = furnitureById(id);
  const draw = DRAW[id];
  if (!def || !draw) return null;
  const W = def.w * 16;
  const H = def.h * 16 + artUp(id);
  const g = new Grid(W, H);
  draw(g, W, H);
  if (id !== "rug" && id !== "flowerbed" && id !== "stone_path") g.outline(OUT, false, 170);
  return g;
}

// ── 바닥 (16×16 타일, 칸마다 살짝 다르게: 4가지 변형) ──

type Tile = (g: Grid, v: number) => void;

const FLOOR: Record<string, Tile> = {
  [DEFAULT_FLOOR]: (g, v) => {
    g.rect(0, 0, 16, 16, 0x2e3d2c);
    for (let i = 0; i < 10; i++) g.set(Math.floor(hash2(i, v, 3) * 16), Math.floor(hash2(v, i, 7) * 16), i % 3 ? 0x3a4c36 : 0x26331f);
  },
  floor_moss: (g, v) => {
    g.rect(0, 0, 16, 16, 0x34502e);
    for (let i = 0; i < 16; i++) g.set(Math.floor(hash2(i, v, 5) * 16), Math.floor(hash2(v, i, 9) * 16), i % 2 ? 0x4a6e3c : 0x2c4426);
    g.ellipse(4 + v * 2, 6, 2, 1.5, 0x5a8248);
  },
  floor_wood: (g, v) => {
    g.rect(0, 0, 16, 16, 0x6a4a30);
    for (const y of [3, 7, 11, 15]) g.hline(0, 15, y, 0x4e3420);
    g.vline((v * 5 + 3) % 16, 0, 2, 0x4e3420);
    g.vline((v * 3 + 9) % 16, 8, 10, 0x4e3420);
    g.hline(2, 5, 1, 0x7c5a3c);
  },
  floor_stone: (g, v) => {
    g.rect(0, 0, 16, 16, 0x56554f);
    g.rect(1, 1, 6, 6, 0x6a6862);
    g.rect(8, 1, 7, 6, 0x64625c);
    g.rect(1, 8, 9, 7, 0x64625c);
    g.rect(11, 8, 4, 7, 0x6a6862);
    if (v === 1) g.set(4, 11, 0x4a6a40);
  },
  floor_petal: (g, v) => {
    g.rect(0, 0, 16, 16, 0x3a3a30);
    for (let i = 0; i < 7; i++) g.set(Math.floor(hash2(i, v, 11) * 16), Math.floor(hash2(v, i, 13) * 16), i % 2 ? 0xf0a8c0 : 0xd08098);
    g.set(8, 8, 0xffd0e0);
  },
};

export function floorGrid(id: string, variant: number): Grid {
  const g = new Grid(16, 16);
  (FLOOR[id] ?? FLOOR[DEFAULT_FLOOR])(g, variant % 4);
  return g;
}

// ── 담장 (16×24: 위 8px이 솟는다) ──

const WALL: Record<string, Tile> = {
  [DEFAULT_WALL]: (g) => {
    for (const x of [1, 7, 13]) {
      g.rect(x, 4, 3, 18, WOOD);
      g.set(x + 1, 3, WOOD);
      g.vline(x + 2, 4, 21, WOOD_D);
    }
    g.rect(0, 9, 16, 2, WOOD_L);
    g.rect(0, 16, 16, 2, WOOD_L);
  },
  wall_stone: (g, v) => {
    g.rect(0, 6, 16, 18, STONE_D);
    for (let row = 0; row < 3; row++)
      for (let x = row % 2 ? -4 : 0; x < 16; x += 8) g.rect(x + 1, 7 + row * 6, 6, 5, row === 0 ? lighten(STONE, 0.1) : STONE);
    if (v % 2) g.rect(3, 6, 4, 2, LEAF_D);
  },
  wall_hedge: (g, v) => {
    g.rect(0, 4, 16, 20, LEAF_D);
    g.ellipse(4, 6, 5, 3, LEAF);
    g.ellipse(12, 7, 5, 3, LEAF);
    for (let i = 0; i < 6; i++) g.set(Math.floor(hash2(i, v, 2) * 16), 8 + Math.floor(hash2(v, i, 4) * 14), LEAF_L);
  },
  wall_iron: (g) => {
    g.rect(0, 20, 16, 4, STONE_D);
    for (const x of [1, 5, 9, 13]) {
      g.vline(x, 4, 19, 0x2a2c30);
      g.set(x, 3, 0x6a6c74);
      g.set(x, 2, 0x2a2c30);
    }
    g.hline(0, 15, 7, 0x3a3c42);
    g.hline(0, 15, 16, 0x3a3c42);
  },
};

export const WALL_H = 24;

export function wallGrid(id: string, variant: number): Grid {
  const g = new Grid(16, WALL_H);
  (WALL[id] ?? WALL[DEFAULT_WALL])(g, variant % 4);
  return g;
}

// ── UI 아이콘 (dataURL, 캐시) ──

const icons = new Map<string, { url: string; w: number; h: number }>();

/** 상점·가방 아이콘. 스킨은 타일 2×2(바닥)·담장 2칸으로 보여 준다 */
export function furnitureIcon(id: string, scale: number): { url: string; w: number; h: number } {
  const key = `${id}@${scale}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const def = furnitureById(id);
  let src: Grid | null;
  if (def?.skin === "floor" || id === DEFAULT_FLOOR) {
    src = new Grid(32, 32);
    for (let i = 0; i < 4; i++) src.draw(floorGrid(id, i), (i % 2) * 16, Math.floor(i / 2) * 16);
  } else if (def?.skin === "wall" || id === DEFAULT_WALL) {
    src = new Grid(32, WALL_H);
    src.draw(wallGrid(id, 0), 0, 0);
    src.draw(wallGrid(id, 1), 16, 0);
  } else src = furnitureGrid(id);
  const g = src ?? new Grid(16, 16);
  const c = document.createElement("canvas");
  c.width = g.w * scale;
  c.height = g.h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.toCanvas(), 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  icons.set(key, out);
  return out;
}
