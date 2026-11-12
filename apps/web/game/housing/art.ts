import { DEFAULT_FLOOR, DEFAULT_WALL, defaultExterior, furnitureById, type HouseExteriorMap } from "@/lib/housing/catalog";
import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";
import { facadeGrid } from "./exterior";

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
  bed: 8,
  piano: 14,
  radio: 4,
  fireplace: 18,
  floor_lamp: 18,
  fridge: 16,
  bathtub: 4,
  cat_cushion: 2,
  grand_clock: 20,
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

/** v = 그림 변형 ("on" 불 켜짐·"on2" 불꽃 두 번째 장·"open" 문 열림·"s0"~"s3" 화분 자람). 상점 아이콘은 "" */
type Draw = (g: Grid, W: number, H: number, v: string) => void;

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
    // 머리판 (위로 8px 솟음)
    box(g, 0, 0, W, 12, WOOD_D);
    g.rect(2, 2, W - 4, 7, WOOD);
    g.hline(2, W - 3, 2, WOOD_L);
    g.rect(0, 0, 3, 14, WOOD_D);
    g.rect(W - 3, 0, 3, 14, WOOD_D);
    // 매트리스 + 흰 시트
    g.rect(1, 10, W - 2, H - 12, 0xe8e2d4);
    g.vline(1, 10, H - 3, 0xc8c0b0);
    g.vline(W - 2, 10, H - 3, 0xc8c0b0);
    // 베개 둘
    g.rect(4, 11, 11, 6, 0xf8f4ea);
    g.rect(W - 15, 11, 11, 6, 0xf8f4ea);
    g.hline(4, 14, 16, 0xd8d0c0);
    g.hline(W - 15, W - 5, 16, 0xd8d0c0);
    // 누빈 이불 (보라) + 접힌 깃
    g.rect(1, 20, W - 2, H - 22, 0x6a4a7a);
    g.hline(1, W - 2, 20, 0x8a6a9a);
    g.hline(1, W - 2, 21, 0xf0ead8);
    for (let y = 24; y < H - 3; y += 5) for (let x = 3; x < W - 2; x += 6) g.set(x + ((y / 5) % 2) * 3, y, 0x553a63);
    // 발판
    box(g, 0, H - 3, W, 3, WOOD_D);
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
  pot: (g, W, H, v) => {
    g.rect(4, H - 8, 8, 7, 0xa85a3a);
    g.hline(3, 12, H - 8, 0xc8704a);
    g.hline(5, 10, H - 7, 0x3a2a1e); // 흙
    const stage = v.startsWith("s") ? Number(v.slice(1)) : 1;
    if (stage <= 0) {
      // 새싹 두 잎
      g.vline(8, H - 11, H - 8, LEAF);
      g.set(7, H - 12, LEAF_L);
      g.set(9, H - 12, LEAF_L);
      g.set(6, H - 12, LEAF);
      g.set(10, H - 12, LEAF);
      return;
    }
    if (stage === 1) {
      g.ellipse(W / 2, 6, 5, 5, LEAF);
      g.set(6, 4, LEAF_L);
      g.set(9, 6, LEAF_L);
      return;
    }
    g.ellipse(W / 2, 6, 6, 5.5, LEAF_D);
    g.ellipse(W / 2 - 1, 5, 4.5, 4, LEAF);
    g.set(5, 3, LEAF_L);
    g.set(10, 6, LEAF_L);
    if (stage === 2) {
      // 봉오리
      g.rect(7, 1, 2, 2, 0xd07090);
      g.set(11, 4, 0xd07090);
    } else {
      // 활짝 핀 꽃
      for (const [x, y, c] of [[5, 2, 0xf0a0c0], [10, 3, 0xf0e080], [7, 7, 0xf6f2e8], [11, 8, 0xf0a0c0]] as const) {
        g.set(x, y, c);
        g.set(x + 1, y, c);
        g.set(x, y + 1, c);
        g.set(x + 1, y + 1, lighten(c, 0.3));
      }
    }
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
  // ── 3번 생활 가구 ──
  piano: (g, W, H) => {
    // 업라이트 피아노: 몸통·뚜껑·악보·건반·다리
    box(g, 1, 0, W - 2, H - 4, 0x2e2220);
    g.rect(2, 1, W - 4, 2, 0x4a3632); // 뚜껑 윤
    g.rect(3, 4, W - 6, 9, 0x3a2a26);
    g.rect(11, 5, 10, 7, 0xf2ead8); // 악보
    for (const y of [7, 9]) g.hline(12, 19, y, 0x9a9488);
    g.set(14, 8, 0x2a2420);
    g.set(17, 6, 0x2a2420);
    // 건반 (앞으로 튀어나온 판)
    g.rect(0, H - 13, W, 6, 0x4a3632);
    g.rect(1, H - 12, W - 2, 4, 0xf6f2e8);
    for (let x = 2; x < W - 2; x += 3) g.vline(x, H - 12, H - 9, 0xc8c0b0);
    for (const x of [3, 6, 12, 15, 18, 24, 27]) g.rect(x, H - 12, 2, 2, 0x1a1412);
    g.rect(2, H - 7, W - 4, 3, 0x2e2220);
    g.rect(3, H - 4, 2, 3, 0x1a1412);
    g.rect(W - 5, H - 4, 2, 3, 0x1a1412);
    g.rect(14, H - 4, 4, 2, 0xc8a050); // 페달
  },
  radio: (g, _W, H, v) => {
    const on = v === "on";
    g.vline(12, 0, 6, 0x9a9a9a); // 안테나
    g.set(12, 0, 0xd0d0d0);
    box(g, 2, 5, 12, H - 6, 0x8a5a36);
    g.rect(3, 6, 10, 1, 0xa87448);
    g.ellipse(6.5, H - 7, 3, 3, 0x3a2a1e); // 스피커
    for (const [x, y] of [[5, H - 8], [7, H - 7], [6, H - 6], [8, H - 8]]) g.set(x, y, 0x6a5040);
    g.rect(10, H - 10, 3, 5, on ? 0x9ff0a0 : 0x5a6a50); // 다이얼 창
    g.set(11, H - 8, on ? 0xffffff : 0x8a9a80);
    g.rect(10, H - 4, 3, 2, 0xc8a050);
  },
  fireplace: (g, W, H, v) => {
    // 돌 벽난로: 위 선반 + 벽돌 몸통 + 아궁이 (불: on/on2 두 장)
    box(g, 0, 0, W, 4, WOOD);
    g.hline(0, W - 1, 0, WOOD_L);
    box(g, 2, 4, W - 4, H - 5, 0x8a4a3a);
    for (let y = 5; y < H - 2; y += 3) for (let x = 2 + ((y / 3) % 2) * 3; x < W - 2; x += 6) g.hline(x, x + 4, y, 0x9c5a46);
    g.rect(1, H - 3, W - 2, 3, STONE_D);
    // 아궁이
    g.rect(8, 11, W - 16, H - 14, 0x1a1210);
    g.ellipse(W / 2, 11, (W - 16) / 2, 3, 0x1a1210);
    g.rect(10, H - 5, W - 20, 2, 0x4a3022); // 장작
    g.set(12, H - 6, 0x6a4430);
    g.set(W - 13, H - 6, 0x6a4430);
    if (v === "on" || v === "on2") {
      const b = v === "on2";
      g.ellipse(W / 2, H - 9, 6, 6, 0xd8501a);
      g.ellipse(W / 2 + (b ? 1 : -1), H - 10, 4, 5, 0xf08a2a);
      g.ellipse(W / 2 + (b ? -1 : 1), H - 9, 2.4, 3.4, 0xffd060);
      g.set(W / 2 + (b ? 3 : -3), H - 16, 0xf08a2a);
      g.set(W / 2 + (b ? -2 : 2), H - 17, 0xffd060);
      g.hline(10, W - 11, H - 5, 0xff7a30);
    }
    // 선반 위 소품 (촛대·액자)
    g.rect(4, 1, 2, 2, 0xf0e8d8);
    g.set(4, 0, 0xffd070);
    g.rect(W - 9, 0, 5, 3, 0xc8a050);
  },
  floor_lamp: (g, W, H, v) => {
    const on = v === "on";
    g.rect(4, H - 3, 8, 2, 0x3a3a40);
    g.vline(8, 10, H - 3, 0x5a5a62);
    // 갓 (사다리꼴)
    for (let y = 1; y <= 9; y++) g.hline(5 - Math.floor(y / 3), 10 + Math.floor(y / 3), y, on ? 0xfff0b0 : 0xe8dcc0);
    g.hline(3, 12, 9, on ? 0xffd870 : 0xc8b898);
    if (on) {
      g.hline(5, 10, 1, 0xffffff);
      g.rect(7, 10, 2, 1, 0xfff6d0);
    }
    void W;
  },
  fridge: (g, W, H, v) => {
    const body = 0xd8ece4;
    box(g, 1, 0, W - 2, H, body);
    g.vline(1, 0, H - 1, 0xb8ccc4);
    g.hline(2, W - 3, 11, 0x98aca4); // 위 문(냉동) 경계
    g.rect(2, H - 2, 2, 2, 0x5a5a5a);
    g.rect(W - 4, H - 2, 2, 2, 0x5a5a5a);
    if (v === "open") {
      // 아래 문이 열려 안이 보인다: 불빛·칸·음식
      g.rect(2, 12, W - 4, H - 14, 0xfff8e0);
      g.hline(2, W - 3, 19, 0xc8d8d0);
      g.hline(2, W - 3, 25, 0xc8d8d0);
      g.rect(4, 15, 3, 4, 0xf4f4f4);
      g.rect(4, 15, 3, 1, 0x6ab0e8);
      g.ellipse(10, 17.5, 2, 1.6, 0xe04848);
      g.rect(5, 21, 6, 3, 0xf8e0b0);
      g.rect(5, 21, 6, 1, 0xfff4f4);
      g.rect(W - 2, 12, 2, H - 14, body); // 열린 문짝 옆선
      g.set(W - 1, 14, 0x8a9a92);
    } else {
      g.vline(W - 4, 4, 8, 0x8a9a92); // 손잡이
      g.vline(W - 4, 14, 22, 0x8a9a92);
      g.rect(4, 15, 4, 3, 0xf0d040); // 자석 메모
      g.rect(5, 20, 3, 3, 0xf0a0b0);
    }
  },
  bathtub: (g, W, H) => {
    // 발 달린 하얀 욕조 + 거품 물 + 수도꼭지
    g.ellipse(W / 2, H - 9, W / 2 - 1, 8, 0xf2f2ee);
    g.rect(2, H - 12, W - 4, 6, 0xf2f2ee);
    g.ellipse(W / 2, H - 12, W / 2 - 3, 4, 0x7ab0d0);
    for (const x of [7, 12, 18, 23]) g.ellipse(x, H - 13, 2, 1.4, 0xeef4fa);
    g.hline(3, W - 4, H - 8, 0xd8d8d0);
    g.rect(4, H - 3, 2, 3, 0xc8a050);
    g.rect(W - 6, H - 3, 2, 3, 0xc8a050);
    g.rect(W - 5, 0, 2, H - 14, 0xb8b8c0); // 수도꼭지
    g.rect(W - 8, 0, 4, 2, 0xb8b8c0);
  },
  cat_cushion: (g, _W, H) => {
    g.ellipse(8, H - 5, 7, 4.5, 0xc04a4a);
    g.ellipse(8, H - 6, 6, 3, 0xd86060);
    // 둥글게 말린 주황 고양이
    g.ellipse(8, H - 8, 5, 3.5, 0xe8a050);
    g.ellipse(5, H - 10, 2.5, 2.2, 0xe8a050);
    g.set(3, H - 13, 0xe8a050);
    g.set(6, H - 13, 0xe8a050);
    g.hline(4, 5, H - 10, 0x5a3a20); // 감은 눈
    g.set(9, H - 9, 0xc8803a);
    g.set(11, H - 8, 0xc8803a);
    g.hline(10, 13, H - 6, 0xe8a050); // 꼬리
  },
  grand_clock: (g, W, H) => {
    box(g, 2, 2, W - 4, H - 3, WOOD_D);
    g.rect(3, 0, W - 6, 3, WOOD);
    g.set(8, 0, WOOD_L);
    g.ellipse(8, 8, 4.5, 4.5, 0xc8a050);
    g.ellipse(8, 8, 3.5, 3.5, 0xf2ead8);
    g.vline(8, 6, 8, 0x2a2420);
    g.hline(8, 10, 8, 0x2a2420);
    g.rect(5, 15, 6, H - 21, 0x2a1c14); // 추 창
    g.vline(8, 15, H - 10, 0xc8a050);
    g.ellipse(8, H - 9, 1.6, 1.6, 0xe0c060);
    g.rect(3, H - 3, W - 6, 2, WOOD);
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

/** 물건 그림 (차지 칸 + 위로 솟는 부분). 없는 id면 null. variant = 불 켜짐·문 열림·화분 단계 (Draw 참고) */
export function furnitureGrid(id: string, variant = ""): Grid | null {
  const def = furnitureById(id);
  const draw = DRAW[id];
  if (!def || !draw) return null;
  const W = def.w * 16;
  const H = def.h * 16 + artUp(id);
  const g = new Grid(W, H);
  draw(g, W, H, variant);
  if (id !== "rug" && id !== "flowerbed" && id !== "stone_path") g.outline(OUT, false, 170);
  return g;
}

// ── 바닥 (16×16 타일, 칸마다 살짝 다르게: 4가지 변형) ── 3번: 집 안 바닥으로 다시 그림 (id는 마당 시절 그대로)

type Tile = (g: Grid, v: number) => void;

/** 집 밖 마당·분양 마을 풀밭 (예전 기본 바닥) */
function yard(g: Grid, v: number): void {
  g.rect(0, 0, 16, 16, 0x2e3d2c);
  for (let i = 0; i < 10; i++) g.set(Math.floor(hash2(i, v, 3) * 16), Math.floor(hash2(v, i, 7) * 16), i % 3 ? 0x3a4c36 : 0x26331f);
}

const speck = (g: Grid, v: number, n: number, salt: number, colors: Color[]) => {
  for (let i = 0; i < n; i++) g.set(Math.floor(hash2(i, v, salt) * 16), Math.floor(hash2(v, i, salt + 2) * 16), colors[i % colors.length]);
};

const FLOOR: Record<string, Tile> = {
  // 낡은 장판: 누런 바탕에 옅은 네모 무늬, 이음선
  [DEFAULT_FLOOR]: (g, v) => {
    g.rect(0, 0, 16, 16, 0xc4a468);
    g.hline(0, 15, 0, 0xb08e56);
    g.vline(0, 0, 15, 0xb08e56);
    for (let y = 4; y < 16; y += 8) for (let x = 4; x < 16; x += 8) g.rect(x, y, 2, 2, 0xcfb07a);
    speck(g, v, 5, 3, [0xb89a60, 0xd0b47e]);
  },
  // 초록 카펫: 촘촘한 털 결
  floor_moss: (g, v) => {
    g.rect(0, 0, 16, 16, 0x4a6e48);
    speck(g, v, 26, 5, [0x567c52, 0x3e6040, 0x5e8658]);
  },
  // 나무 마루: 가로 널 4줄, 줄마다 이음매가 엇갈린다
  floor_wood: (g, v) => {
    const tones = [0x8a5e3a, 0x7e5434, 0x925f39, 0x83583a];
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      g.rect(0, y, 16, 4, tones[(row + v) % 4]);
      g.hline(0, 15, y + 3, 0x5a3a22);
      const seam = (row * 7 + v * 5) % 16;
      g.vline(seam, y, y + 2, 0x5a3a22);
      g.hline((seam + 3) % 16, (seam + 6) % 16, y + 1, lighten(tones[(row + v) % 4], 0.12));
    }
  },
  // 대리석: 밝은 회색 판석 + 물결 결 + 줄눈
  floor_stone: (g, v) => {
    g.rect(0, 0, 16, 16, 0xb6b3aa);
    g.hline(0, 15, 15, 0x8a877e);
    g.vline(15, 0, 15, 0x8a877e);
    for (let i = 0; i < 9; i++) g.set(2 + i + (v % 2), 3 + Math.round(Math.sin(i / 2 + v) * 2) + i / 2, 0x9c998f);
    g.hline(1, 3, 1, 0xd0cdc4);
  },
  // 체크 타일: 크림·갈색 8칸 바둑판
  floor_tile: (g) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.rect(x * 8, y * 8, 8, 8, (x + y) % 2 ? 0x8a6a4a : 0xe8dcc0);
    g.hline(0, 15, 0, 0xc8bca0);
    g.vline(0, 0, 15, 0xc8bca0);
    g.set(2, 2, 0xf6eedc);
  },
  // 분홍 카펫: 꽃잎 수
  floor_petal: (g, v) => {
    g.rect(0, 0, 16, 16, 0xb86e86);
    speck(g, v, 14, 11, [0xc47c94, 0xa86278]);
    const cx = 4 + (v % 2) * 8;
    const cy = 4 + Math.floor(v / 2) * 8;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) g.set(cx + dx, cy + dy, 0xf0b0c4);
    g.set(cx, cy, 0xffe080);
  },
};

export function floorGrid(id: string, variant: number): Grid {
  const g = new Grid(16, 16);
  (FLOOR[id] ?? FLOOR[DEFAULT_FLOOR])(g, variant % 4);
  return g;
}

/** 집 밖 마당·분양 마을 풀밭 타일 */
export function yardGrid(variant: number): Grid {
  const g = new Grid(16, 16);
  yard(g, variant % 4);
  return g;
}

// ── 벽 (안쪽 벽면 16×WALL_H): 위 천장 테(4) + 몰딩(2) + 벽지 + 걸레받이(5) ── 3번 집 안 개편

export const WALL_H = 40;
/** 벽지 무늬가 그려지는 줄 범위 */
const PAPER_Y0 = 6;
const PAPER_Y1 = WALL_H - 6;

const PAPER: Record<string, Tile> = {
  // 나무 판자 벽 (기본)
  [DEFAULT_WALL]: (g, v) => {
    for (let x = 0; x < 16; x += 4) {
      const c = (x / 4 + v) % 2 ? 0x9a7048 : 0x8e6640;
      g.rect(x, PAPER_Y0, 4, PAPER_Y1 - PAPER_Y0 + 1, c);
      g.vline(x + 3, PAPER_Y0, PAPER_Y1, 0x6a4a2e);
    }
    g.set(5 + v * 2, 16 + v * 3, 0x6a4a2e);
    g.set(6 + v * 2, 16 + v * 3, 0x7a5636);
  },
  // 돌벽
  wall_stone: (g, v) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0x5f5d57);
    for (let row = 0; PAPER_Y0 + row * 6 < PAPER_Y1; row++) {
      const y = PAPER_Y0 + row * 6;
      for (let x = row % 2 ? -4 : 0; x < 16; x += 8) {
        g.rect(x + 1, y + 1, 6, Math.min(5, PAPER_Y1 - y), (row + v + x) % 3 ? 0x8c8a82 : 0x9a978e);
        g.hline(x + 1, x + 6, y + 1, 0xaaa79c);
      }
    }
  },
  // 풀잎 벽지
  wall_hedge: (g, v) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0xb4c894);
    for (let y = PAPER_Y0 + 3; y < PAPER_Y1; y += 8)
      for (let x = ((y / 8) | 0) % 2 ? 2 : 10; x < 16; x += 16) {
        g.set(x, y, 0x6a8a4a);
        g.set(x + 1, y - 1, 0x7a9a5a);
        g.set(x - 1, y + 1, 0x7a9a5a);
        g.set(x + 1, y + 1, 0x8aaa6a);
      }
    if (v % 2) g.set(13, PAPER_Y0 + 12, 0x6a8a4a);
  },
  // 꽃무늬 벽지
  wall_paper: (g) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0xf0e2c4);
    for (let y = PAPER_Y0 + 3; y < PAPER_Y1 - 1; y += 7) {
      const x = ((y - PAPER_Y0) / 7) % 2 ? 11 : 3;
      g.rect(x, y, 2, 2, 0xd06a7a);
      g.set(x, y, 0xe890a0);
      g.set(x - 1, y + 2, 0x8aa070);
      g.set(x + 2, y + 2, 0x8aa070);
    }
  },
  // 남색 장식 벽지 + 아래 나무 판 (징두리)
  wall_iron: (g) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0x2a3452);
    for (let y = PAPER_Y0 + 3; y < PAPER_Y1 - 12; y += 8) {
      const x = ((y - PAPER_Y0) / 8) % 2 ? 12 : 4;
      g.set(x, y - 1, 0xc8a050);
      g.set(x - 1, y, 0xc8a050);
      g.set(x + 1, y, 0xc8a050);
      g.set(x, y + 1, 0xc8a050);
      g.set(x, y, 0x8a7040);
    }
    g.rect(0, PAPER_Y1 - 10, 16, 11, 0x4a2e1e);
    g.hline(0, 15, PAPER_Y1 - 10, 0x8a6040);
    g.rect(2, PAPER_Y1 - 8, 12, 7, 0x553522);
  },
};

export function wallGrid(id: string, variant: number): Grid {
  const g = new Grid(16, WALL_H);
  // 천장 테 (어두운 들보) + 몰딩
  g.rect(0, 0, 16, 4, 0x2a2018);
  g.hline(0, 15, 0, 0x4a3828);
  g.hline(0, 15, 4, 0xe8dcc8);
  g.hline(0, 15, 5, 0xb8a890);
  (PAPER[id] ?? PAPER[DEFAULT_WALL])(g, variant % 4);
  // 걸레받이
  g.rect(0, WALL_H - 5, 16, 5, 0x5a3a22);
  g.hline(0, 15, WALL_H - 5, 0x8a6040);
  g.hline(0, 15, WALL_H - 1, 0x3a2416);
  return g;
}

/** 옆벽·칸막이 벽 윗면 색 (벽 종류에 맞춘 어두운 테) */
export function wallCapColor(id: string): Color {
  return id === "wall_stone" ? 0x4a4842 : id === "wall_iron" ? 0x1e2438 : 0x3a2a1e;
}

/** 칸막이 벽 끝면(앞에서 보이는 면) 색 = 벽지 바탕 */
export function wallFaceColor(id: string): Color {
  const g = wallGrid(id, 0);
  const v = g.get(1, Math.floor(WALL_H / 2));
  return (v >>> 8) & 0xffffff;
}

// ── 창문 (안쪽 벽, 32×24): 낮 하늘·밤하늘 × 닫힘·열림 ──

export const WINDOW_W = 32;
export const WINDOW_H = 24;

export function windowGrid(night: boolean, open: boolean): Grid {
  const g = new Grid(WINDOW_W, WINDOW_H);
  const W = WINDOW_W;
  const H = WINDOW_H;
  // 틀
  g.rect(0, 0, W, H - 2, 0x6a4a30);
  // 하늘
  for (let y = 2; y < H - 4; y++) {
    const t = (y - 2) / (H - 6);
    const c = night ? mixColor(0x141c34, 0x26304c, t) : mixColor(0x8cc4ec, 0xd4ecfa, t);
    g.hline(2, W - 3, y, c);
  }
  if (night) {
    for (const [x, y] of [[6, 5], [12, 9], [21, 4], [26, 11], [9, 14], [18, 15]]) g.set(x, y, 0xf0f0ff);
    g.ellipse(24, 7, 2.6, 2.6, 0xf2ecc8);
    g.ellipse(25, 6, 2, 2, 0x1c2440);
  } else {
    g.ellipse(9, 8, 4, 2, 0xffffff);
    g.ellipse(12, 7, 3, 2, 0xffffff);
    g.ellipse(22, 13, 3.5, 1.6, 0xf4faff);
    // 먼 나무 실루엣
    for (let x = 2; x < W - 2; x++) g.vline(x, H - 6 - Math.round(1.5 + Math.sin(x / 2.3) * 1.5), H - 5, 0x5a8a5a);
  }
  if (open) {
    // 창짝이 양옆으로 열렸다: 가장자리에 좁은 유리 창짝 + 바람에 날리는 커튼
    g.rect(2, 2, 3, H - 6, 0x8a6a48);
    g.rect(W - 5, 2, 3, H - 6, 0x8a6a48);
    for (let y = 2; y < H - 4; y++) {
      g.set(5 + (y % 4 === 0 ? 1 : 0), y, 0xd86a6a);
      g.set(W - 6 - (y % 4 === 2 ? 1 : 0), y, 0xd86a6a);
    }
  } else {
    // 닫힌 창: 가운데 창살 + 유리 반사 + 양옆 커튼
    g.vline(W / 2, 2, H - 5, 0x6a4a30);
    g.hline(2, W - 3, Math.floor((H - 4) / 2), 0x6a4a30);
    for (let i = 0; i < 4; i++) g.set(6 + i, 12 - i, night ? 0x4a5878 : 0xffffff);
    for (let y = 2; y < H - 4; y++) {
      g.hline(2, 5 + (y > H - 9 ? 1 : 0), y, 0xc85a5a);
      g.hline(W - 6 - (y > H - 9 ? 1 : 0), W - 3, y, 0xc85a5a);
    }
    g.vline(4, 2, H - 5, 0xa84a4a);
    g.vline(W - 5, 2, H - 5, 0xa84a4a);
  }
  // 창턱
  g.rect(0, H - 4, W, 2, 0x8a6a48);
  g.rect(-1, H - 2, W + 2, 2, 0x5a3a22);
  g.hline(0, W - 1, H - 4, 0xa88a68);
  g.outline(OUT, false, 200);
  return g;
}

function mixColor(a: Color, b: Color, t: number): Color {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 벽등 (12×10): 밤에 켜진다 */
export function sconceGrid(on: boolean): Grid {
  const g = new Grid(12, 10);
  g.rect(5, 6, 2, 4, 0x5a4a3a);
  for (let y = 0; y < 6; y++) g.hline(3 - (y >> 1), 8 + (y >> 1), y, on ? 0xfff0b0 : 0xd8ccb0);
  if (on) g.hline(3, 8, 0, 0xffffff);
  g.outline(OUT, false, 200);
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
  } else if (def?.ext) src = facadeGrid({ ...defaultExterior(), [def.ext]: id }, "small");
  else src = furnitureGrid(id);
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

/**
 * 3번 상점 "놓아 본 모습": 기본 벽·바닥 위에 그 물건을 놓고 그림자까지 그린 미리보기 (dataURL, 캐시).
 * 스킨이면 그 벽지·바닥을 입힌 작은 방 귀퉁이를 보여 준다.
 */
export function furniturePreview(id: string, scale: number): { url: string; w: number; h: number } {
  const key = `preview:${id}@${scale}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const def = furnitureById(id);
  const fw = def && !def.skin ? def.w : 2;
  const fh = def && !def.skin ? def.h : 1;
  const cols = Math.max(3, fw + 2);
  const rows = fh + 1;
  // 벽지 스킨은 벽을 거의 다 보여 준다 (아래 판·무늬가 같이 보이게)
  const wallShow = def?.skin === "wall" ? WALL_H - 4 : 18;
  const W = cols * 16;
  const H = wallShow + rows * 16;
  const floorId = def?.skin === "floor" ? id : DEFAULT_FLOOR;
  const wallId = def?.skin === "wall" ? id : DEFAULT_WALL;
  const g = new Grid(W, H);
  for (let x = 0; x < cols; x++) {
    const wall = wallGrid(wallId, x);
    // 벽 아래쪽(벽지 + 걸레받이)만 보인다
    for (let y = 0; y < wallShow; y++) for (let i = 0; i < 16; i++) g.px[y * W + x * 16 + i] = wall.px[(WALL_H - wallShow + y) * 16 + i];
    for (let y = 0; y < rows; y++) g.draw(floorGrid(floorId, x * 5 + y * 3), x * 16, wallShow + y * 16);
  }
  // 벽 밑 그늘
  for (let x = 0; x < W; x++) g.set(x, wallShow, darken(((g.get(x, wallShow) >>> 8) & 0xffffff) as Color, 0.35));
  if (def && !def.skin && !def.ext) {
    const art = furnitureGrid(id);
    if (art) {
      const left = Math.floor((cols - fw) / 2) * 16;
      const bottom = wallShow + fh * 16 + 8;
      if (!def.floor) {
        // 바닥 그림자
        for (let x = left + 2; x < left + fw * 16 - 1; x++)
          for (let y = bottom - 4; y < bottom; y++) {
            const c = (g.get(x, y) >>> 8) & 0xffffff;
            g.set(x, y, darken(c as Color, 0.3));
          }
      }
      g.draw(art, left, bottom - art.h);
    }
  }
  const c = document.createElement("canvas");
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.toCanvas(), 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  icons.set(key, out);
  return out;
}

// ── 집 외관 (필지 한 칸 그림) → exterior.ts ──

export { FACADE_H, FACADE_W, facadeGrid, facadeInfo, type FacadeInfo } from "./exterior";

/** 외관 미리보기 dataURL (UI). 같은 외관·크기·낮밤은 캐시 */
export function facadePreview(ext: HouseExteriorMap, tier: string, scale: number, night = false): { url: string; w: number; h: number } {
  const key = `facade:${tier}:${Object.values(ext).join(",")}@${scale}${night ? ":night" : ""}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const g = facadeGrid(ext, tier, { night });
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
